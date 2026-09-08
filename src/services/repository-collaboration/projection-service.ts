import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import type { CollaborationSnapshotFiles } from '@/lib/repository-collaboration'
import { projectSnapshotInTransaction } from './projection-helpers'

export async function projectAuthoredCollaborationSnapshot(
  bindingId: string,
  client: PrismaClient = prisma,
): Promise<CollaborationSnapshotFiles> {
  return client.$transaction(transaction => projectSnapshotInTransaction(transaction, bindingId))
}
