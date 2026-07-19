import { createServer } from 'node:net'

import type { PrismaClient } from '@prisma/client'

import { ServiceError } from '@/services/shared/errors'

type EnvironmentClient = Pick<PrismaClient, 'environment'>

async function portAvailable(port: number, hostname: string) {
  return new Promise<boolean>(resolve => {
    const server = createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen({ port, host: hostname, exclusive: true }, () => server.close(() => resolve(true)))
  })
}

async function foreignEnvironmentOrigins(
  input: { targetProjectId: string; excludeEnvironmentId?: string },
  client: EnvironmentClient,
) {
  const environments = await client.environment.findMany({
    where: {
      targetProjectId: { not: input.targetProjectId },
      ...(input.excludeEnvironmentId ? { id: { not: input.excludeEnvironmentId } } : {}),
    },
    select: { id: true, name: true, baseUrl: true, targetProjectId: true },
  })
  return environments.map(environment => ({
    ...environment,
    origin: normalizedLoopbackOrigin(environment.baseUrl),
  }))
}

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

export async function suggestAvailableLoopbackBaseUrl(
  input: { baseUrl: string; targetProjectId: string; excludeEnvironmentId?: string },
  client: EnvironmentClient,
  isPortAvailable: (port: number, hostname: string) => Promise<boolean> = portAvailable,
) {
  const origin = normalizedLoopbackOrigin(input.baseUrl)
  if (!origin) return undefined
  const url = new URL(input.baseUrl)
  const start = Number(url.port || (url.protocol === 'https:' ? 443 : 80))
  const hostname =
    url.hostname.replace(/^\[|\]$/g, '') === 'localhost' ? '127.0.0.1' : url.hostname.replace(/^\[|\]$/g, '')
  const reservedOrigins = new Set(
    (await foreignEnvironmentOrigins(input, client))
      .map(environment => environment.origin)
      .filter((value): value is string => Boolean(value)),
  )
  for (let port = start + 1; port <= Math.min(start + 50, 65_535); port += 1) {
    url.port = String(port)
    if (reservedOrigins.has(normalizedLoopbackOrigin(url.toString())!)) continue
    if (!(await isPortAvailable(port, hostname))) continue
    return url.toString().replace(/\/$/, '')
  }
  return undefined
}

export async function assertLoopbackOriginReservation(
  input: { baseUrl: string; targetProjectId: string; excludeEnvironmentId?: string },
  client: EnvironmentClient,
  isPortAvailable: (port: number, hostname: string) => Promise<boolean> = portAvailable,
) {
  const origin = normalizedLoopbackOrigin(input.baseUrl)
  if (!origin) return
  const environments = await foreignEnvironmentOrigins(input, client)
  const conflict = environments.find(environment => environment.origin === origin)
  if (!conflict) return
  const suggestedBaseUrl = await suggestAvailableLoopbackBaseUrl(input, client, isPortAvailable)
  throw new ServiceError(
    `Loopback origin ${origin} is already reserved by another target project environment.`,
    'CONFLICT',
    undefined,
    {
      code: 'ENVIRONMENT_ORIGIN_RESERVED',
      origin,
      conflictingEnvironmentId: conflict.id,
      conflictingEnvironmentName: conflict.name,
      ...(suggestedBaseUrl ? { suggestedBaseUrl } : {}),
      nextRecommendedAction: suggestedBaseUrl
        ? `Repropose the environment with baseUrl ${suggestedBaseUrl}.`
        : 'Choose a different local port, then update or repropose the environment.',
    },
  )
}
