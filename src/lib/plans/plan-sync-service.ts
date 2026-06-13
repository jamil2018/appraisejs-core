import { createHash } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  parseJsonArtifact,
  parseYamlArtifact,
  type LayoutArtifact,
  type PlanArtifact,
  type ReviewArtifact,
  type ValidationArtifact,
} from '@/lib/plan-contract'

import { PlanArtifactRepository, type StoredPlanArtifact } from './artifact-repository'
import { findProjectRoot } from './project-root'
import { capturePlanRevision } from './revision-snapshot'

const CONFLICT_MARKER = /^(<{7}|={7}|>{7})/m

type ProjectedArtifacts = {
  plan: PlanArtifact
  review?: ReviewArtifact
  validation?: ValidationArtifact
  layout?: LayoutArtifact
}

export type PlanSyncResult = {
  scanned: number
  existing: number
  created: number
  updated: number
  deleted: number
  errors: number
  stale: number
  conflicted: number
  reducedAssurance: boolean
}

function sourceHash(artifacts: StoredPlanArtifact[]): string {
  const canonical = artifacts
    .map(artifact => `${artifact.relativePath}\0${artifact.hash}`)
    .sort()
    .join('\n')
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`
}

function groupArtifacts(artifacts: StoredPlanArtifact[]): Map<string, StoredPlanArtifact[]> {
  const grouped = new Map<string, StoredPlanArtifact[]>()
  for (const artifact of artifacts) {
    const entries = grouped.get(artifact.planId) ?? []
    entries.push(artifact)
    grouped.set(artifact.planId, entries)
  }
  return grouped
}

function parseArtifacts(artifacts: StoredPlanArtifact[]): ProjectedArtifacts {
  const parsed: Partial<ProjectedArtifacts> = {}
  for (const artifact of artifacts) {
    if (CONFLICT_MARKER.test(artifact.content)) {
      throw new Error(`Merge conflict markers found in ${artifact.relativePath}`)
    }
    const value =
      artifact.kind === 'layout'
        ? parseJsonArtifact(artifact.kind, artifact.content)
        : parseYamlArtifact(artifact.kind, artifact.content)
    if ((value as { planId: string }).planId !== artifact.planId) {
      throw new Error(`Artifact planId does not match ${artifact.relativePath}`)
    }
    Object.assign(parsed, { [artifact.kind]: value })
  }
  if (!parsed.plan) throw new Error('Plan YAML is missing')
  return parsed as ProjectedArtifacts
}

async function markProjectionStale(
  client: PrismaClient,
  planId: string,
  artifacts: StoredPlanArtifact[],
  error: unknown,
): Promise<'stale' | 'missing'> {
  const projection = await client.planProjection.findUnique({ where: { planId } })
  if (!projection) return 'missing'
  const conflicted = artifacts.some(artifact => CONFLICT_MARKER.test(artifact.content))
  await client.$transaction([
    client.planProjection.update({
      where: { planId },
      data: { stale: true, conflicted, lastSyncAt: new Date() },
    }),
    client.planSyncIssue.create({
      data: {
        planProjectionId: projection.id,
        code: conflicted ? 'merge-conflict' : 'invalid-artifact',
        artifactPath: artifacts.find(artifact => CONFLICT_MARKER.test(artifact.content))?.relativePath,
        message: error instanceof Error ? error.message : String(error),
      },
    }),
  ])
  return 'stale'
}

async function projectValidPlan(
  client: PrismaClient,
  projectRoot: string,
  artifacts: StoredPlanArtifact[],
  parsed: ProjectedArtifacts,
): Promise<'created' | 'updated' | 'existing'> {
  const hash = sourceHash(artifacts)
  const existing = await client.planProjection.findUnique({
    where: { planId: parsed.plan.planId },
    include: { revisions: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })
  const snapshot = await capturePlanRevision(projectRoot, artifacts, existing?.revisions[0]?.gitCommit)
  const unchanged = existing?.sourceHash === hash && !existing.stale && !existing.conflicted

  // The transaction intentionally keeps every child, issue, and revision update atomic.
  // fallow-ignore-next-line complexity
  await client.$transaction(async transaction => {
    const projection = await transaction.planProjection.upsert({
      where: { planId: parsed.plan.planId },
      create: {
        planId: parsed.plan.planId,
        revision: parsed.plan.revision,
        lifecycle: parsed.plan.lifecycle,
        goal: parsed.plan.goal,
        description: parsed.plan.description,
        sourceHash: hash,
        planPath: artifacts.find(artifact => artifact.kind === 'plan')!.relativePath,
        reviewJson: parsed.review ? JSON.stringify(parsed.review) : null,
        validationJson: parsed.validation ? JSON.stringify(parsed.validation) : null,
        layoutJson: parsed.layout ? JSON.stringify(parsed.layout) : null,
        lastValidProjectedAt: new Date(),
      },
      update: {
        revision: parsed.plan.revision,
        lifecycle: parsed.plan.lifecycle,
        goal: parsed.plan.goal,
        description: parsed.plan.description,
        sourceHash: hash,
        reviewJson: parsed.review ? JSON.stringify(parsed.review) : null,
        validationJson: parsed.validation ? JSON.stringify(parsed.validation) : null,
        layoutJson: parsed.layout ? JSON.stringify(parsed.layout) : null,
        stale: false,
        conflicted: false,
        deletedAt: null,
        lastValidProjectedAt: new Date(),
        lastSyncAt: new Date(),
      },
    })

    const taskIds = parsed.plan.tasks.map(task => task.id)
    await transaction.planTaskProjection.deleteMany({
      where: { planProjectionId: projection.id, taskId: { notIn: taskIds } },
    })
    for (const [position, task] of parsed.plan.tasks.entries()) {
      await transaction.planTaskProjection.upsert({
        where: { planProjectionId_taskId: { planProjectionId: projection.id, taskId: task.id } },
        create: {
          planProjectionId: projection.id,
          taskId: task.id,
          title: task.title,
          description: task.description,
          acceptanceJson: JSON.stringify(task.acceptanceCriteria),
          validationIntent: task.validationIntent,
          position,
        },
        update: {
          title: task.title,
          description: task.description,
          acceptanceJson: JSON.stringify(task.acceptanceCriteria),
          validationIntent: task.validationIntent,
          position,
        },
      })
    }
    await transaction.planSyncIssue.updateMany({
      where: { planProjectionId: projection.id, resolvedAt: null },
      data: { resolvedAt: new Date() },
    })
    await transaction.planRevision.upsert({
      where: { planProjectionId_sourceHash: { planProjectionId: projection.id, sourceHash: hash } },
      create: {
        planProjectionId: projection.id,
        sourceHash: hash,
        gitCommit: snapshot.gitCommit,
        dirtyHashesJson: Object.keys(snapshot.dirtyHashes).length ? JSON.stringify(snapshot.dirtyHashes) : null,
        snapshotJson: snapshot.snapshot ? JSON.stringify(snapshot.snapshot) : null,
        reducedAssurance: snapshot.reducedAssurance,
      },
      update: {},
    })
    if (snapshot.historyTampered) {
      await transaction.planSyncIssue.create({
        data: {
          planProjectionId: projection.id,
          code: 'history-tampering',
          message: 'The current Git commit no longer descends from the recorded plan baseline.',
        },
      })
      await transaction.planProjection.update({
        where: { id: projection.id },
        data: { stale: true },
      })
    }
  })

  if (!existing) return 'created'
  return unchanged ? 'existing' : 'updated'
}

export async function syncPlans(options?: {
  projectDirectory?: string
  client?: PrismaClient
}): Promise<PlanSyncResult> {
  const client = options?.client ?? prisma
  const projectRoot = await findProjectRoot(options?.projectDirectory)
  const repository = new PlanArtifactRepository(projectRoot)
  const artifacts = await repository.list()
  const grouped = groupArtifacts(artifacts)
  const existing = await client.planProjection.findMany({ select: { planId: true } })
  const result: PlanSyncResult = {
    scanned: grouped.size,
    existing: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    errors: 0,
    stale: 0,
    conflicted: 0,
    reducedAssurance: false,
  }

  for (const [planId, planArtifacts] of grouped) {
    try {
      const parsed = parseArtifacts(planArtifacts)
      const outcome = await projectValidPlan(client, projectRoot, planArtifacts, parsed)
      result[outcome] += 1
    } catch (error) {
      result.errors += 1
      const staleOutcome = await markProjectionStale(client, planId, planArtifacts, error)
      if (staleOutcome === 'stale') result.stale += 1
      if (planArtifacts.some(artifact => CONFLICT_MARKER.test(artifact.content))) result.conflicted += 1
    }
  }

  for (const projection of existing) {
    if (grouped.has(projection.planId)) continue
    await client.planProjection.delete({ where: { planId: projection.planId } })
    result.deleted += 1
  }

  result.reducedAssurance = Boolean(
    await client.planRevision.findFirst({ where: { reducedAssurance: true }, select: { id: true } }),
  )
  return result
}

export async function countPendingPlanSync(client: PrismaClient = prisma): Promise<number> {
  const repository = new PlanArtifactRepository()
  const artifacts = await repository.list()
  const grouped = groupArtifacts(artifacts)
  const projections = await client.planProjection.findMany({ select: { planId: true, sourceHash: true, stale: true } })
  const projected = new Map(projections.map(projection => [projection.planId, projection]))
  let pending = projections.filter(projection => !grouped.has(projection.planId)).length

  for (const [planId, planArtifacts] of grouped) {
    const projection = projected.get(planId)
    if (!projection || projection.stale || projection.sourceHash !== sourceHash(planArtifacts)) pending += 1
  }
  return pending
}
