import type { PrismaClient } from '@prisma/client'

import { ServiceError } from '@/services/shared/errors'

type EnvironmentClient = Pick<PrismaClient, 'environment'>

export function normalizedLoopbackOrigin(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) return null
  const protocol = url.protocol.toLowerCase()
  const port = url.port || (protocol === 'https:' ? '443' : protocol === 'http:' ? '80' : '')
  if (!port || !['http:', 'https:'].includes(protocol)) return null
  return `${protocol}//127.0.0.1:${port}`
}

export async function assertLoopbackOriginReservation(
  input: { baseUrl: string; targetProjectId: string; excludeEnvironmentId?: string },
  client: EnvironmentClient,
) {
  const origin = normalizedLoopbackOrigin(input.baseUrl)
  if (!origin) return
  const environments = await client.environment.findMany({
    where: {
      targetProjectId: { not: input.targetProjectId },
      ...(input.excludeEnvironmentId ? { id: { not: input.excludeEnvironmentId } } : {}),
    },
    select: { id: true, name: true, baseUrl: true, targetProjectId: true },
  })
  const conflict = environments.find(environment => normalizedLoopbackOrigin(environment.baseUrl) === origin)
  if (!conflict) return
  throw new ServiceError(
    `Loopback origin ${origin} is already reserved by another target project environment.`,
    'CONFLICT',
    undefined,
    {
      code: 'ENVIRONMENT_ORIGIN_RESERVED',
      origin,
      conflictingEnvironmentId: conflict.id,
      conflictingEnvironmentName: conflict.name,
      nextRecommendedAction: 'Choose a different local port, then update or repropose the environment.',
    },
  )
}
