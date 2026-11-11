import { stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'

/** Process-local references to original supervisors. Persisted identities never recreate these handles. */
type Scope = { journeyId: string; targetProjectId: string }
type TurnSnapshot = {
  fenced: boolean
  completed: boolean
  turnOutcome?: string
  cleanup?: { groupExitObserved: boolean; privateRootRemoved: boolean }
}
type OwnedTurn = Scope & {
  attemptId: string
  transportId: string
  databaseIdentity: string
  cancel: () => Promise<TurnSnapshot>
}
const turns = new Set<WeakRef<OwnedTurn>>()

/** Stable across clients of this file, distinct for a copied hub. Contains no credential or process identity. */
export async function readOwnedJourneyTurnDatabaseIdentity(client: PrismaClient | Prisma.TransactionClient) {
  const databases = await client.$queryRawUnsafe<Array<{ name: string; file: string }>>('PRAGMA database_list')
  const file = databases.find(database => database.name === 'main')?.file
  if (!file) throw new Error('Owned turn recovery requires an on-disk canonical database.')
  const first = await stat(file, { bigint: true })
  const check = await client.$queryRawUnsafe<Array<{ name: string; file: string }>>('PRAGMA database_list')
  const last = await stat(file, { bigint: true })
  if (
    check.find(database => database.name === 'main')?.file !== file ||
    first.dev !== last.dev ||
    first.ino !== last.ino
  )
    throw new Error('Canonical database file changed during cleanup identity capture.')
  // This matches registered live handles only. Path stat is not proof of SQLite connection ownership or authority.
  return `sha256:${createHash('sha256').update(`appraise.owned-turn-database/v2\0${file}\0${last.dev}\0${last.ino}`).digest('hex')}`
}

export function registerOwnedQualityJourneyTurn(turn: OwnedTurn) {
  turns.add(new WeakRef(turn))
}

/** Called only after the canonical pause transaction commits; cancel closes each gate synchronously. */
export async function stopOwnedQualityJourneyTurns(
  scope: Scope,
  attemptIds: readonly string[],
  databaseIdentity?: string,
) {
  const selected: OwnedTurn[] = []
  for (const reference of turns) {
    const turn = reference.deref()
    if (!turn) turns.delete(reference)
    else if (
      turn.databaseIdentity === databaseIdentity &&
      turn.journeyId === scope.journeyId &&
      turn.targetProjectId === scope.targetProjectId &&
      attemptIds.includes(turn.attemptId)
    )
      selected.push(turn)
  }
  // Enter every original cancellation before awaiting any drain. No lookup, reattach or numeric signaling.
  const receipts = await Promise.all(
    selected.map(async turn => {
      try {
        const originalStop = turn.cancel()
        let timer: ReturnType<typeof setTimeout> | undefined
        const stopped = await Promise.race([
          originalStop,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Owned turn cleanup observation timed out.')), 5_000)
          }),
        ]).finally(() => {
          if (timer) clearTimeout(timer)
        })
        return {
          attemptId: turn.attemptId,
          transportId: turn.transportId,
          stopRequested: true,
          senderFenced: stopped.fenced,
          turnCompleted: stopped.completed,
          turnOutcome: stopped.turnOutcome ?? 'UNKNOWN',
          ownedProcessExitObserved: stopped.cleanup?.groupExitObserved === true,
          privateRootRemoved: stopped.cleanup?.privateRootRemoved === true,
        }
      } catch {
        return {
          attemptId: turn.attemptId,
          transportId: turn.transportId,
          stopRequested: true,
          senderFenced: false,
          turnCompleted: false,
          turnOutcome: 'UNKNOWN',
          ownedProcessExitObserved: false,
          privateRootRemoved: false,
        }
      }
    }),
  )
  receipts.sort((a, b) => a.transportId.localeCompare(b.transportId))
  const observed =
    attemptIds.every(id => receipts.some(receipt => receipt.attemptId === id)) &&
    receipts.every(receipt => receipt.senderFenced && receipt.ownedProcessExitObserved && receipt.privateRootRemoved)
  return {
    managedTurn: attemptIds.length === 0 ? 'NONE_REGISTERED' : observed ? 'OBSERVED' : 'UNKNOWN',
    managedTurnReceipts: receipts,
  }
}
