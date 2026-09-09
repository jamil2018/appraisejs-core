import type { Prisma } from '@prisma/client'

import { ServiceError } from '@/services/shared/errors'

type Transaction = Prisma.TransactionClient

/**
 * A redeemed handoff worker is bound to one durable ticket. Consumers that
 * renew its lease or persist its proposal use this lookup to ensure the
 * session cannot outlive the ticket that created it.
 */
export async function activeRedeemedHandoffTicket(
  transaction: Transaction,
  worker: { provenance: string; trustedPrincipalId: string; bindingId: string },
  now: Date,
) {
  if (worker.provenance !== 'handoff-ticket') return null
  const ticketId = worker.trustedPrincipalId.startsWith('handoff-ticket:')
    ? worker.trustedPrincipalId.slice('handoff-ticket:'.length)
    : ''
  const ticket = ticketId ? await transaction.collaborationHandoffTicket.findUnique({ where: { id: ticketId } }) : null
  if (
    !ticket ||
    ticket.bindingId !== worker.bindingId ||
    !ticket.redeemedAt ||
    ticket.invalidatedAt ||
    ticket.expiresAt <= now
  ) {
    throw new ServiceError('The redeemed handoff session is expired or invalid.', 'CONFLICT', 409)
  }
  return ticket
}
