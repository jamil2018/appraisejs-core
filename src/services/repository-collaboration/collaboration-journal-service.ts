import type { Prisma } from '@prisma/client'

import { canonicalJson } from '@/lib/repository-collaboration'

type Transaction = Prisma.TransactionClient

/** Appends a total-ordered durable boundary record for a collaboration operation. */
export async function appendCollaborationJournalEntry(
  transaction: Transaction,
  operationId: string,
  boundary: string,
  details: Record<string, unknown>,
  status = 'COMMITTED',
) {
  const last = await transaction.collaborationJournalEntry.findFirst({
    where: { operationId },
    orderBy: { sequence: 'desc' },
  })
  await transaction.collaborationJournalEntry.create({
    data: {
      operationId,
      sequence: (last?.sequence ?? 0) + 1,
      boundary,
      status,
      detailsJson: canonicalJson(details),
    },
  })
}
