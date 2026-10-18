/** Trusted B14 permission event binding. Supplied evidence never qualifies a native run alone. */
import { B14_PROFILE } from '../codex-app-server-m02-ta-native-plans-r10/plans.mjs'

export function createB14PermissionEvidence({ journal, getPeer, plan, writeReceipt }) {
  if (
    typeof journal?.snapshot !== 'function' ||
    typeof getPeer !== 'function' ||
    plan?.caseId !== 'B14' ||
    typeof writeReceipt !== 'function'
  )
    throw new Error('B14 trusted evidence ports missing')
  let requested = null
  let terminal = false
  const current = () => {
    const journalState = journal.snapshot()
    const peerState = getPeer()?.snapshot()
    if (
      journalState.activeCase !== 'B14' ||
      journalState.fenced ||
      !peerState ||
      !peerState.threadId ||
      !peerState.turnId
    )
      throw new Error('B14 owned case correlation missing')
    return { journalState, peerState }
  }
  return Object.freeze({
    async verifyRequest(frame, { threadId, turnId }) {
      const { journalState, peerState } = current()
      if (
        requested ||
        terminal ||
        peerState.threadId !== threadId ||
        peerState.turnId !== turnId ||
        journalState.counts.providerRequests !== 1 ||
        journalState.counts.permissionReplies !== 0 ||
        frame?.params?.permissions?.network?.enabled !== true ||
        frame.params.threadId !== threadId ||
        frame.params.turnId !== turnId
      )
        return false
      const receipt = {
        caseId: 'B14',
        event: 'permission-request-observed',
        requestedNetworkEnabled: true,
        threadTurnCorrelated: true,
        grants: 0,
      }
      await writeReceipt('permission-request', receipt)
      requested = { requestId: frame.id, itemId: frame.params.itemId, threadId, turnId }
      return true
    },
    async verifyTerminal(frame, { requestId, itemId, threadId, turnId }) {
      const { journalState, peerState } = current()
      if (
        !requested ||
        terminal ||
        requested.requestId !== requestId ||
        requested.itemId !== itemId ||
        requested.threadId !== threadId ||
        requested.turnId !== turnId ||
        peerState.permissionReplied !== true ||
        peerState.permissionResolved !== true ||
        journalState.counts.permissionReplies !== 1 ||
        frame?.params?.turn?.status !== 'completed' ||
        frame.params.threadId !== threadId ||
        frame.params.turn.id !== turnId
      )
        return false
      await writeReceipt('permission-terminal', {
        caseId: 'B14',
        event: 'permission-denial-terminal',
        resolved: true,
        grants: 0,
      })
      terminal = true
      return true
    },
    permissionEvidence() {
      const { journalState, peerState } = current()
      if (
        !requested ||
        peerState.permissionRequestId !== requested.requestId ||
        peerState.permissionReplied !== true ||
        peerState.permissionResolved !== true ||
        journalState.counts.permissionReplies !== 1
      )
        throw new Error('B14 permission pair missing before continuation')
      return Object.freeze({
        callId: plan.callId,
        requests: 1,
        replies: 1,
        requestResolved: true,
        requestedNetworkEnabled: true,
        threadTurnCorrelated: true,
        reply: B14_PROFILE.reply,
      })
    },
    snapshot: () => Object.freeze({ requested: Boolean(requested), terminal, grants: 0 }),
  })
}
