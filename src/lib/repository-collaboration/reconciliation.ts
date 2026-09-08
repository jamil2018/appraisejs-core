import { collaborationHash } from './canonical'
import type { CollaborationRecord } from './contracts'
import { recordKey } from './graph'

export type CollaborationChangeDisposition =
  'CREATE' | 'ADOPT_REVIEW' | 'USE_INCOMING' | 'KEEP_LOCAL' | 'REBASE' | 'UNCHANGED' | 'CONFLICT' | 'TOMBSTONE_ONLY'

export interface PreparedCollaborationRecord {
  recordKey: string
  disposition: CollaborationChangeDisposition
  local: CollaborationRecord | null
  incoming: CollaborationRecord
  baseline: CollaborationRecord | null
  localHash: string | null
  incomingHash: string
  baselineHash: string | null
  requiresDecision: boolean
}

function recordHash(record: CollaborationRecord | null): string | null {
  return record ? collaborationHash(record) : null
}

function classifyDisposition(input: {
  hasLocal: boolean
  hasBaseline: boolean
  incomingArchived: boolean
  localHash: string | null
  incomingHash: string
  baselineHash: string | null
}): CollaborationChangeDisposition {
  if (!input.hasBaseline) {
    if (!input.hasLocal) return input.incomingArchived ? 'TOMBSTONE_ONLY' : 'CREATE'
    return 'ADOPT_REVIEW'
  }
  if (!input.hasLocal) return 'CONFLICT'
  if (input.localHash === input.incomingHash) {
    return input.localHash === input.baselineHash ? 'UNCHANGED' : 'REBASE'
  }
  if (input.localHash === input.baselineHash) return 'USE_INCOMING'
  if (input.incomingHash === input.baselineHash) return 'KEEP_LOCAL'
  return 'CONFLICT'
}

export function prepareThreeWayCollaboration(input: {
  incoming: CollaborationRecord[]
  localByKey: Map<string, CollaborationRecord>
  baselineByKey: Map<string, CollaborationRecord>
}): PreparedCollaborationRecord[] {
  return input.incoming.map(incoming => {
    const key = recordKey(incoming)
    const local = input.localByKey.get(key) ?? null
    const baseline = input.baselineByKey.get(key) ?? null
    const localHash = recordHash(local)
    const incomingHash = recordHash(incoming)!
    const baselineHash = recordHash(baseline)
    const disposition = classifyDisposition({
      hasLocal: local !== null,
      hasBaseline: baseline !== null,
      incomingArchived: incoming.archived,
      localHash,
      incomingHash,
      baselineHash,
    })

    return {
      recordKey: key,
      disposition,
      local,
      incoming,
      baseline,
      localHash,
      incomingHash,
      baselineHash,
      requiresDecision: disposition === 'ADOPT_REVIEW' || disposition === 'CONFLICT',
    }
  })
}

export function resolvePreparedCollaboration(
  prepared: PreparedCollaborationRecord[],
  decisions: Map<string, { decision: 'KEEP_LOCAL' | 'USE_INCOMING' | 'EDIT'; editedRecord?: CollaborationRecord }>,
): CollaborationRecord[] {
  return prepared.flatMap(item => resolvePreparedRecord(item, decisions.get(item.recordKey)))
}

function resolvePreparedRecord(
  item: PreparedCollaborationRecord,
  decision?: { decision: 'KEEP_LOCAL' | 'USE_INCOMING' | 'EDIT'; editedRecord?: CollaborationRecord },
): CollaborationRecord[] {
  if (!decision) {
    if (item.requiresDecision) throw new Error(`Missing decision for ${item.recordKey}`)
    return item.disposition === 'KEEP_LOCAL' ? localRecord(item) : [item.incoming]
  }
  if (decision.decision === 'KEEP_LOCAL') return localRecord(item)
  if (decision.decision === 'EDIT') return editedRecord(item, decision.editedRecord)
  return [item.incoming]
}

function localRecord(item: PreparedCollaborationRecord): CollaborationRecord[] {
  return item.local ? [item.local] : []
}

function editedRecord(item: PreparedCollaborationRecord, record?: CollaborationRecord): CollaborationRecord[] {
  if (!record || recordKey(record) !== item.recordKey) {
    throw new Error(`Edited resolution identity mismatch for ${item.recordKey}`)
  }
  return [record]
}
