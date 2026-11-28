import type { Prisma, PrismaClient, QualityJourneyDiscoveryRevision } from '@prisma/client'
import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { managedScoutSnapshotId } from '@/lib/quality-journey/managed-scout-snapshot'
import { ServiceError } from '@/services/shared/errors'
import { assertCurrentCoordinatorSession } from './quality-journey-coordinator-session'
import { readInternalScoutEvidence } from './quality-journey-discovery-browser-service'

type Scope = { journeyId: string; targetProjectId: string }
type Evidence = Awaited<ReturnType<typeof readInternalScoutEvidence>>
type Member = Pick<Evidence[number], 'artifactId' | 'contentHash'>
export type ManagedScoutEvidenceReviewView = {
  discoveryRevisionId: string
  pages: Array<Pick<Evidence[number], 'artifactId' | 'routeId' | 'environmentId'>>
  reviewHash: string | null
}

const kind = 'MANAGED_SCOUT_EVIDENCE_REVIEW'
const reviewIdentity = (id: string) => `managed-scout-evidence:${id}`

function conflict(message: string): never {
  throw new ServiceError(message, 'CONFLICT')
}

function manifest(revision: QualityJourneyDiscoveryRevision, members: Member[]) {
  return {
    discoveryRevisionId: revision.id,
    workItemId: revision.scoutWorkItemId,
    scopeHash: revision.scopeHash,
    members,
  }
}

function memberRefs(pages: Evidence): Member[] {
  return pages.map(({ artifactId, contentHash }) => ({ artifactId, contentHash }))
}

/** Only the current issued multi-page Scout work has an operator review surface. */
async function reviewContext(scope: Scope, tx: Prisma.TransactionClient) {
  const journey = await tx.qualityJourney.findFirst({
    where: { id: scope.journeyId, targetProjectId: scope.targetProjectId },
    include: { currentCoordinatorSession: true, activeDiscoveryRevision: { include: { scoutWorkItem: true } } },
  })
  const revision = journey?.activeDiscoveryRevision
  const owner = journey?.currentCoordinatorSession
  if (
    !journey ||
    !revision ||
    !owner ||
    owner.generation === null ||
    owner.status !== 'ACTIVE' ||
    owner.ownerPrincipalId !== `appraise-local:${scope.targetProjectId}` ||
    journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
    journey.status !== 'ACTIVE' ||
    journey.stage !== 'DISCOVERY' ||
    revision.status !== 'COLLECTING' ||
    revision.cycleId !== journey.activeCycleId ||
    (JSON.parse(revision.scoutScopeJson).routes?.length ?? 0) < 2 ||
    JSON.parse(journey.blockerIdsJson).length ||
    JSON.parse(journey.unresolvedQuestionIdsJson).length ||
    revision.scoutWorkItem.status !== 'ELIGIBLE' ||
    revision.scoutWorkItem.currentAttempt !== 0 ||
    !(JSON.parse(journey.activeWorkItemIdsJson) as string[]).includes(revision.scoutWorkItemId)
  )
    return null
  return { revision, owner, coordinatorGeneration: owner.generation }
}

/** Pick one current, provenance-verified capture for each inspected environment/page pair. */
function reviewPages(revision: QualityJourneyDiscoveryRevision, evidence: Evidence) {
  const seen = new Set<string>()
  const pages = evidence.filter(page => {
    const key = JSON.stringify([page.environmentId, page.routeId])
    if (page.snapshotId !== managedScoutSnapshotId(revision.id) || !page.facts.length || seen.has(key)) return false
    seen.add(key)
    return true
  })
  return pages.sort((a, b) => (a.artifactId < b.artifactId ? -1 : a.artifactId > b.artifactId ? 1 : 0))
}

function reviewHash(revision: QualityJourneyDiscoveryRevision, pages: Evidence) {
  if (!pages.length || pages.length > 256) return null
  return hashCanonical(manifest(revision, memberRefs(pages)))
}

export async function getManagedScoutEvidenceReview(
  scope: Scope,
  client: PrismaClient = prisma,
): Promise<ManagedScoutEvidenceReviewView | null> {
  return client.$transaction(async tx => {
    const context = await reviewContext(scope, tx)
    if (!context) return null
    const { revision } = context
    const evidence = await readInternalScoutEvidence(revision, tx)
    const sealed = await readSealedManagedScoutEvidence(revision, evidence, tx)
    const pages = sealed ?? reviewPages(revision, evidence)
    return {
      discoveryRevisionId: revision.id,
      pages: pages.map(({ artifactId, routeId, environmentId }) => ({ artifactId, routeId, environmentId })),
      reviewHash: sealed ? null : reviewHash(revision, pages),
    }
  })
}

export async function sealManagedScoutEvidenceReview(
  input: Scope & { discoveryRevisionId: string; reviewHash: string },
  client: PrismaClient = prisma,
) {
  return client.$transaction(async tx => {
    const context = await reviewContext(input, tx)
    if (!context || context.revision.id !== input.discoveryRevisionId)
      return conflict('The inspected pages no longer belong to the current Scout review.')
    const { revision, owner, coordinatorGeneration } = context
    await assertCurrentCoordinatorSession(
      {
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        coordinatorSessionId: owner.id,
        coordinatorGeneration,
        coordinatorPrincipalId: owner.ownerPrincipalId,
      },
      tx,
    )
    const identityKey = reviewIdentity(revision.id)
    const existing = await tx.qualityJourneyArtifact.findUnique({
      where: { journeyId_identityKey: { journeyId: revision.journeyId, identityKey } },
    })
    if (existing) {
      if (existing.kind === kind && existing.contentHash === input.reviewHash) return
      return conflict('The inspected pages were already reviewed. Reload to see the current work.')
    }
    if (
      await tx.qualityJourneyOwnedBrowser.findFirst({
        where: {
          journeyId: revision.journeyId,
          targetProjectId: revision.targetProjectId,
          status: { not: 'STOP_OBSERVED' },
        },
      })
    )
      return conflict('Close the inspection browser before continuing with the captured pages.')
    const pages = reviewPages(revision, await readInternalScoutEvidence(revision, tx))
    if (reviewHash(revision, pages) !== input.reviewHash)
      return conflict('The inspected pages changed. Review the current pages before continuing.')
    await tx.qualityJourneyArtifact.create({
      data: {
        id: identityKey,
        identityKey,
        artifactId: identityKey,
        journeyId: revision.journeyId,
        targetProjectId: revision.targetProjectId,
        cycleId: revision.cycleId,
        kind,
        contentHash: input.reviewHash,
        artifactJson: canonicalContractJson(manifest(revision, memberRefs(pages))),
      },
    })
  })
}

/** A sealed set remains fixed across reconnects and ignores later receipts. */
export async function readSealedManagedScoutEvidence(
  revision: QualityJourneyDiscoveryRevision,
  evidence: Evidence,
  tx: Prisma.TransactionClient,
) {
  const artifact = await tx.qualityJourneyArtifact.findUnique({
    where: {
      journeyId_identityKey: {
        journeyId: revision.journeyId,
        identityKey: reviewIdentity(revision.id),
      },
    },
  })
  if (!artifact) return null
  const descriptor = JSON.parse(artifact.artifactJson) as { members?: Member[] }
  if (
    artifact.kind !== kind ||
    artifact.targetProjectId !== revision.targetProjectId ||
    artifact.cycleId !== revision.cycleId ||
    !Array.isArray(descriptor.members) ||
    !descriptor.members.length ||
    descriptor.members.length > 256
  )
    return conflict('The inspected-page review could not be verified.')
  const byId = new Map(evidence.map(page => [page.artifactId, page]))
  const expectedSnapshotId = managedScoutSnapshotId(revision.id)
  const pages = descriptor.members.map(member => {
    const page = byId.get(member?.artifactId)
    if (!page || page.contentHash !== member.contentHash || page.snapshotId !== expectedSnapshotId)
      return conflict('A reviewed page inspection is missing or changed.')
    return page
  })
  const expected = manifest(revision, memberRefs(pages))
  if (
    new Set(pages.map(page => page.artifactId)).size !== pages.length ||
    artifact.artifactJson !== canonicalContractJson(expected) ||
    artifact.contentHash !== hashCanonical(expected)
  )
    return conflict('The inspected-page review could not be verified.')
  return pages
}
