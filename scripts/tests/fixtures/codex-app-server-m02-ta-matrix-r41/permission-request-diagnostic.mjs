/** Closed permission-request diagnostics only. No frame, value, identifier, or path is retained. */
import { join } from 'node:path'
import { POLICY } from './policy.mjs'

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const only = (value, fields) => record(value) && Object.keys(value).every(key => fields.includes(key))
const b14Workspace = join(POLICY.roots.T2, 'cases/B14/workspace')
const approvalFields = ['cwd', 'environmentId', 'itemId', 'permissions', 'reason', 'startedAtMs', 'threadId', 'turnId']
const permissionRequestId = value =>
  (Number.isSafeInteger(value) && value >= 0) || (typeof value === 'string' && /^[A-Za-z0-9._:-]{1,80}$/.test(value))

export const PERMISSION_DIAGNOSTIC_REASONS = Object.freeze([
  'ACCEPTED_SCHEMA',
  'PEER_PHASE_NOT_TURN',
  'PEER_RPC_PENDING',
  'DUPLICATE_PERMISSION_REQUEST',
  'FRAME_FIELDS_INVALID',
  'JSONRPC_INVALID',
  'REQUEST_ID_INVALID',
  'METHOD_INVALID',
  'PARAMETER_FIELDS_INVALID',
  'CWD_MISMATCH',
  'ITEM_ID_NOT_STRING',
  'ITEM_ID_FORMAT_INVALID',
  'THREAD_MISMATCH',
  'TURN_MISMATCH',
  'STARTED_AT_NOT_SAFE_INTEGER',
  'PERMISSION_FIELDS_INVALID',
  'FILESYSTEM_NOT_ABSENT_OR_NULL',
  'NETWORK_FIELDS_INVALID',
  'NETWORK_NOT_ENABLED',
  'ENVIRONMENT_ID_TYPE_INVALID',
  'REASON_TYPE_INVALID',
  'CALLER_VERIFIER_REJECTED',
  'CALLER_VERIFIER_ERROR',
])

/** Original ordered predicates, with the reviewed absent-or-null fileSystem schema correction only. */
export function permissionRequestFailure(frame, threadId, turnId) {
  const params = frame.params
  if (!only(frame, ['jsonrpc', 'id', 'method', 'params'])) return 'FRAME_FIELDS_INVALID'
  if (!(frame.jsonrpc === undefined || frame.jsonrpc === '2.0')) return 'JSONRPC_INVALID'
  if (!permissionRequestId(frame.id)) return 'REQUEST_ID_INVALID'
  if (!(frame.method === 'item/permissions/requestApproval')) return 'METHOD_INVALID'
  if (!only(params, approvalFields)) return 'PARAMETER_FIELDS_INVALID'
  if (!(params.cwd === b14Workspace)) return 'CWD_MISMATCH'
  if (!(typeof params.itemId === 'string')) return 'ITEM_ID_NOT_STRING'
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(params.itemId)) return 'ITEM_ID_FORMAT_INVALID'
  if (!(params.threadId === threadId)) return 'THREAD_MISMATCH'
  if (!(params.turnId === turnId)) return 'TURN_MISMATCH'
  if (!Number.isSafeInteger(params.startedAtMs)) return 'STARTED_AT_NOT_SAFE_INTEGER'
  if (!only(params.permissions, ['network', 'fileSystem'])) return 'PERMISSION_FIELDS_INVALID'
  if (!(!Object.hasOwn(params.permissions, 'fileSystem') || params.permissions.fileSystem === null))
    return 'FILESYSTEM_NOT_ABSENT_OR_NULL'
  if (!only(params.permissions.network, ['enabled'])) return 'NETWORK_FIELDS_INVALID'
  if (!(params.permissions.network.enabled === true)) return 'NETWORK_NOT_ENABLED'
  if (!(
    params.environmentId === undefined ||
    params.environmentId === null ||
    typeof params.environmentId === 'string'
  ))
    return 'ENVIRONMENT_ID_TYPE_INVALID'
  if (!(params.reason === undefined || params.reason === null || typeof params.reason === 'string'))
    return 'REASON_TYPE_INVALID'
  return null
}

const nullableFieldShape = (value, key) =>
  !record(value) || !Object.hasOwn(value, key)
    ? 'ABSENT'
    : value[key] === null
      ? 'NULL'
      : typeof value[key] === 'string'
        ? 'STRING'
        : 'OTHER'

export function createPermissionDiagnostic(reason, frame, threadId, turnId) {
  if (!PERMISSION_DIAGNOSTIC_REASONS.includes(reason)) throw new Error('permission diagnostic reason contract')
  const params = record(frame?.params) ? frame.params : null
  const permissions = record(params?.permissions) ? params.permissions : null
  const fields = permissions ? Object.keys(permissions).sort().join(',') : null
  const fileSystem =
    !permissions || !Object.hasOwn(permissions, 'fileSystem')
      ? 'ABSENT'
      : permissions.fileSystem === null
        ? 'NULL'
        : 'OTHER'
  return Object.freeze({
    reason,
    permissionsShape:
      fields === 'network'
        ? 'NETWORK_ONLY'
        : fields === 'fileSystem,network' && fileSystem === 'NULL'
          ? 'NETWORK_PLUS_NULL_FILESYSTEM'
          : 'OTHER',
    fileSystem,
    cwd: params?.cwd === b14Workspace ? 'MATCH' : 'OTHER',
    requestIdShape:
      Number.isSafeInteger(frame?.id) && frame.id >= 0
        ? 'SAFE_NONNEGATIVE_INTEGER'
        : typeof frame?.id === 'string' && /^[A-Za-z0-9._:-]{1,80}$/.test(frame.id)
          ? 'SAFE_TOKEN'
          : 'OTHER',
    itemIdShape:
      typeof params?.itemId === 'string'
        ? /^[A-Za-z0-9._:-]{1,200}$/.test(params.itemId)
          ? 'SAFE_TOKEN'
          : 'STRING_OTHER'
        : 'OTHER',
    threadMatches: params !== null && params.threadId === threadId,
    turnMatches: params !== null && params.turnId === turnId,
    startedAtSafeInteger: Number.isSafeInteger(params?.startedAtMs),
    networkEnabled: params?.permissions?.network?.enabled === true,
    environmentIdShape: nullableFieldShape(params, 'environmentId'),
    reasonShape: nullableFieldShape(params, 'reason'),
  })
}
