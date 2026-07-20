import path from 'node:path'

import type { PrismaClient } from '@prisma/client'

import type { ValidationArtifact } from '@/lib/plan-contract'
import {
  assertLoopbackOriginReservation,
  normalizedLoopbackOrigin,
  suggestAvailableLoopbackBaseUrl,
} from '@/services/environment/environment-origin-reservation'
import { ServiceError } from '@/services/shared/errors'

type TargetProjectIdentity = { id: string; displayName: string; canonicalPath: string }
type FetchLike = typeof fetch

export type EnvironmentRuntimePreflight = {
  environmentId: string
  environmentName: string
  baseUrl: string
  origin: string | null
  status: 'available' | 'verified' | 'reachable_unverified'
  observedPageTitle?: string
  expectedPageTitle?: string
  warning?: string
}

function normalizedTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function pageTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match?.[1]?.replace(/\s+/g, ' ').trim().slice(0, 200)
}

async function readBoundedBody(response: Response, maxBytes = 65_536) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (length < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      const remaining = maxBytes - length
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value
      chunks.push(chunk)
      length += chunk.byteLength
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

async function fetchPageTitle(baseUrl: string, fetchImpl: FetchLike) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1_500)
  try {
    const response = await fetchImpl(baseUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { accept: 'text/html' },
    })
    return { reachable: true as const, title: pageTitle(await readBoundedBody(response)) }
  } catch {
    return { reachable: false as const }
  } finally {
    clearTimeout(timeout)
  }
}

function expectedIdentityTitles(
  environment: { expectedPageTitle: string | null },
  targetProject: TargetProjectIdentity,
) {
  return [environment.expectedPageTitle, targetProject.displayName, path.basename(targetProject.canonicalPath)]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizedTitle)
}

async function throwIdentityMismatch(
  environment: { id: string; name: string; baseUrl: string; expectedPageTitle: string | null },
  targetProject: TargetProjectIdentity,
  observedPageTitle: string | undefined,
  client: PrismaClient,
  conflictingTargetProjectId?: string,
): Promise<never> {
  const suggestedBaseUrl = await suggestAvailableLoopbackBaseUrl(
    { baseUrl: environment.baseUrl, targetProjectId: targetProject.id, excludeEnvironmentId: environment.id },
    client,
  )
  throw new ServiceError(
    `Environment ${environment.name} is serving an unexpected application at ${environment.baseUrl}.`,
    'CONFLICT',
    undefined,
    {
      code: 'ENVIRONMENT_IDENTITY_MISMATCH',
      environmentId: environment.id,
      environmentName: environment.name,
      observedPageTitle: observedPageTitle ?? null,
      expectedPageTitle: environment.expectedPageTitle ?? targetProject.displayName,
      ...(conflictingTargetProjectId ? { conflictingTargetProjectId } : {}),
      ...(suggestedBaseUrl ? { suggestedBaseUrl } : {}),
      nextRecommendedAction: suggestedBaseUrl
        ? `Start the target application on ${suggestedBaseUrl}, update the environment, and retry baseline_start.`
        : 'Stop the conflicting application or choose another local port, then retry baseline_start.',
    },
  )
}

function assessObservedIdentity(
  observedPageTitle: string | undefined,
  expectedPageTitle: string | null,
  targetProject: TargetProjectIdentity,
  foreignProjects: Array<{ id: string; displayName: string }>,
) {
  const observed = observedPageTitle ? normalizedTitle(observedPageTitle) : ''
  const verified = Boolean(observed && expectedIdentityTitles({ expectedPageTitle }, targetProject).includes(observed))
  const foreignMatch = foreignProjects.find(project => normalizedTitle(project.displayName) === observed)
  const explicitMismatch = Boolean(expectedPageTitle && observed !== normalizedTitle(expectedPageTitle))
  return { explicitMismatch, foreignMatch, verified }
}

function reachablePreflight(
  environment: { id: string; name: string; baseUrl: string; expectedPageTitle: string | null },
  targetProject: TargetProjectIdentity,
  origin: string,
  observedPageTitle: string | undefined,
  verified: boolean,
): EnvironmentRuntimePreflight {
  const result: EnvironmentRuntimePreflight = {
    environmentId: environment.id,
    environmentName: environment.name,
    baseUrl: environment.baseUrl,
    origin,
    status: verified ? 'verified' : 'reachable_unverified',
    observedPageTitle,
    expectedPageTitle: environment.expectedPageTitle ?? targetProject.displayName,
  }
  if (!verified) result.warning = 'The origin is reachable, but its page title does not identify this target project.'
  return result
}

async function probeEnvironment(
  environment: { id: string; name: string; baseUrl: string; expectedPageTitle: string | null },
  targetProject: TargetProjectIdentity,
  foreignProjects: Array<{ id: string; displayName: string }>,
  client: PrismaClient,
  fetchImpl: FetchLike,
): Promise<EnvironmentRuntimePreflight> {
  const origin = normalizedLoopbackOrigin(environment.baseUrl)
  if (!origin)
    return {
      environmentId: environment.id,
      environmentName: environment.name,
      baseUrl: environment.baseUrl,
      origin,
      status: 'reachable_unverified',
      warning: 'Remote environment identity is not probed automatically.',
    }
  const probe = await fetchPageTitle(environment.baseUrl, fetchImpl)
  if (!probe.reachable) {
    return {
      environmentId: environment.id,
      environmentName: environment.name,
      baseUrl: environment.baseUrl,
      origin,
      status: 'available',
      expectedPageTitle: environment.expectedPageTitle ?? undefined,
    }
  }
  const observedPageTitle = probe.title
  const { explicitMismatch, foreignMatch, verified } = assessObservedIdentity(
    observedPageTitle,
    environment.expectedPageTitle,
    targetProject,
    foreignProjects,
  )
  if (explicitMismatch || foreignMatch) {
    await throwIdentityMismatch(environment, targetProject, observedPageTitle, client, foreignMatch?.id)
  }
  return reachablePreflight(environment, targetProject, origin, observedPageTitle, verified)
}

export async function preflightBaselineEnvironments(
  validation: ValidationArtifact,
  targetProject: TargetProjectIdentity,
  client: PrismaClient,
  fetchImpl: FetchLike = fetch,
) {
  const environmentReferences = [
    ...new Set(validation.validations.flatMap(node => node.matrix.map(entry => entry.environment))),
  ]
  const environments = await client.environment.findMany({
    where: {
      targetProjectId: targetProject.id,
      OR: [{ id: { in: environmentReferences } }, { name: { in: environmentReferences } }],
    },
    select: { id: true, name: true, baseUrl: true, expectedPageTitle: true },
  })
  const foreignProjects = await client.targetProject.findMany({
    where: { id: { not: targetProject.id } },
    select: { id: true, displayName: true },
  })
  return Promise.all(
    environments.map(async environment => {
      await assertLoopbackOriginReservation(
        { baseUrl: environment.baseUrl, targetProjectId: targetProject.id, excludeEnvironmentId: environment.id },
        client,
      )
      return probeEnvironment(environment, targetProject, foreignProjects, client, fetchImpl)
    }),
  )
}
