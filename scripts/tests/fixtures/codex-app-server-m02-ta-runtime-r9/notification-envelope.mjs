const own = (value, key) => Object.hasOwn(value, key)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Validate only the schema-wide idless notification wrapper. Method params retain their own gates. */
export function inspectNotificationEnvelope(frame) {
  const timestampPresent = object(frame) && own(frame, 'emittedAtMs')
  const result = (ok, reason = null) => Object.freeze({ ok, reason, timestampPresent })
  if (!object(frame)) return result(false, 'NOT_OBJECT')
  if (own(frame, 'id')) return result(false, 'ID_PRESENT')
  if (own(frame, 'result') || own(frame, 'error')) return result(false, 'RESPONSE_FIELDS_PRESENT')
  if (Object.keys(frame).some(key => !['jsonrpc', 'method', 'params', 'emittedAtMs'].includes(key)))
    return result(false, 'EXTRA_FIELD')
  if (own(frame, 'jsonrpc') && frame.jsonrpc !== '2.0') return result(false, 'JSONRPC_INVALID')
  if (
    !own(frame, 'method') ||
    typeof frame.method !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9/._:-]{0,199}$/.test(frame.method)
  )
    return result(false, 'METHOD_INVALID')
  if (!own(frame, 'params') || !object(frame.params)) return result(false, 'PARAMS_INVALID')
  if (timestampPresent && !Number.isSafeInteger(frame.emittedAtMs)) return result(false, 'TIMESTAMP_INVALID')
  return result(true)
}

export const NOTIFICATION_ENVELOPE_FAILURE_REASONS = Object.freeze([
  'NOT_OBJECT',
  'ID_PRESENT',
  'RESPONSE_FIELDS_PRESENT',
  'EXTRA_FIELD',
  'JSONRPC_INVALID',
  'METHOD_INVALID',
  'PARAMS_INVALID',
  'TIMESTAMP_INVALID',
])
