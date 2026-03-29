import prisma from '@/config/db-config'
import { ServiceError } from '@/services/shared/errors'

export async function resolveConflictsByEntityIds(conflictIds: string[]): Promise<number> {
  const updatedConflicts = await prisma.conflictResolution.updateMany({
    where: { entityId: { in: conflictIds } },
    data: { resolved: true },
  })
  if (updatedConflicts.count === 0) {
    throw new ServiceError('No conflicts found', 'NOT_FOUND', 404)
  }
  return updatedConflicts.count
}
