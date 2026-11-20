import type { Prisma, PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { ServiceError } from '@/services/shared/errors'

type Db = PrismaClient | Prisma.TransactionClient
export type DiscoverySetupItem = 'environment' | 'module' | 'locator-group'
export type DiscoveryPrerequisites = { ready: boolean; missing: DiscoverySetupItem[] }

/** Use the same active project registry for preflight and the frozen Discovery scope. */
export async function readDiscoveryRegistries(targetProjectId: string, db: Db) {
  const [environments, modules, locatorGroups] = await Promise.all([
    db.environment.findMany({
      where: { targetProjectId, archivedAt: null },
      select: { id: true, baseUrl: true, scopeVersion: true, discoveryAuthTransitPolicyJson: true },
    }),
    db.module.findMany({
      where: { targetProjectId, archivedAt: null },
      select: { id: true, name: true, updatedAt: true },
    }),
    db.locatorGroup.findMany({
      where: { targetProjectId, archivedAt: null, module: { targetProjectId, archivedAt: null } },
      select: { id: true, route: true, moduleId: true },
    }),
  ])
  return { environments, modules, locatorGroups }
}

export function discoveryPrerequisites(
  registry: Awaited<ReturnType<typeof readDiscoveryRegistries>>,
): DiscoveryPrerequisites {
  const missing: DiscoverySetupItem[] = []
  if (!registry.environments.length) missing.push('environment')
  if (!registry.modules.length) missing.push('module')
  if (!registry.locatorGroups.length) missing.push('locator-group')
  return { ready: missing.length === 0, missing }
}

export async function getQualityJourneyDiscoveryPrerequisites(targetProjectId: string, db: Db = prisma) {
  return discoveryPrerequisites(await readDiscoveryRegistries(targetProjectId, db))
}

export function assertDiscoveryPrerequisites(prerequisites: DiscoveryPrerequisites) {
  if (prerequisites.ready) return
  const descriptions: Record<DiscoverySetupItem, string> = {
    environment: 'an active environment with the target base URL',
    module: 'an active destination module',
    'locator-group': 'an active locator group with an explicitly registered route in that module',
  }
  throw new ServiceError(
    `Discovery setup is incomplete for this project. Create ${prerequisites.missing.map(item => descriptions[item]).join('; ')} before approving Analysis.`,
    'CONFLICT',
    409,
    { missingDiscoverySetup: prerequisites.missing },
  )
}
