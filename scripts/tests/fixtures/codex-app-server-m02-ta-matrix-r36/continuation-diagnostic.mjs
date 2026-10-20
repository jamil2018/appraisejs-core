/** Fixed diagnostics around the unchanged R10 codec; no error or output data is retained. */
import { decodeCodeModeContinuation } from '../codex-app-server-m02-ta-codec-r10/codec.mjs'

export const DIAGNOSTIC_CATEGORIES = Object.freeze({
  R10_CODEC: Object.freeze([
    'PLAN',
    'OUTER_CORRELATION',
    'OUTPUT_SHAPE',
    'COMPLETION_HEADER',
    'ENVELOPE',
    'AUDIT',
    'NESTED_RESULT',
    'OTHER',
  ]),
  PRODUCER: Object.freeze(['CONTINUATION_SHAPE', 'CALL_CORRELATION', 'OUTPUT_CEILING', 'OTHER']),
  AUDIT: Object.freeze(['INCOMPLETE', 'PLAN_CORRELATION', 'REGISTRY_ABSENCE']),
  SESSION: Object.freeze(['OUTPUT_CORRELATION', 'REJECTION_ENVELOPE']),
})

export const OUTPUT_STATUSES = Object.freeze(['COMPLETED', 'FAILED', 'YIELDED', 'TERMINATED', 'OTHER'])
export const SCRIPT_FAILURE_MARKERS = Object.freeze([
  'NONE',
  'M02_REGISTRY_BOUND',
  'M02_ROUTE_UNAVAILABLE',
  'M02_UNEXPECTED_ROUTE',
  'MULTIPLE',
  'OTHER',
])
const controlledMarkers = new Set(['M02_REGISTRY_BOUND', 'M02_ROUTE_UNAVAILABLE', 'M02_UNEXPECTED_ROUTE'])
const unknownOutput = Object.freeze({ status: 'OTHER', scriptMarker: 'OTHER' })
const outputBound = 64 * 1024

function exactText(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const fields = Object.getOwnPropertyDescriptors(item)
  if (
    Reflect.ownKeys(fields).length !== 2 ||
    Object.keys(fields).sort().join(',') !== 'text,type' ||
    !Object.hasOwn(fields.type, 'value') ||
    !Object.hasOwn(fields.text, 'value') ||
    fields.type.value !== 'input_text' ||
    typeof fields.text.value !== 'string'
  )
    return null
  return fields.text.value
}

/** Untrusted output observation only; these fixed bins establish neither cause nor acceptance. */
export function classifyOutputObservation(output) {
  try {
    if (!Array.isArray(output) || Object.getOwnPropertyDescriptor(output, 'length')?.value !== 2) return unknownOutput
    const header = exactText(Object.getOwnPropertyDescriptor(output, '0')?.value)
    const payload = exactText(Object.getOwnPropertyDescriptor(output, '1')?.value)
    if (
      header === null ||
      payload === null ||
      header.length + payload.length > outputBound ||
      Buffer.byteLength(header) + Buffer.byteLength(payload) > outputBound
    )
      return unknownOutput
    const firstLine = header.split('\n', 1)[0]
    const status =
      firstLine === 'Script completed'
        ? 'COMPLETED'
        : firstLine === 'Script failed'
          ? 'FAILED'
          : firstLine === 'Script terminated'
            ? 'TERMINATED'
            : /^Script running with cell ID [A-Za-z0-9._:-]{1,200}$/.test(firstLine)
              ? 'YIELDED'
              : 'OTHER'
    const markers = new Set()
    for (const match of payload.matchAll(/(?:^|[^A-Za-z0-9_])(M02_[A-Za-z0-9_]+)(?=$|[^A-Za-z0-9_])/g)) {
      if (!controlledMarkers.has(match[1])) return Object.freeze({ status, scriptMarker: 'OTHER' })
      markers.add(match[1])
    }
    const scriptMarker = markers.size > 1 ? 'MULTIPLE' : markers.size === 1 ? [...markers][0] : 'NONE'
    return Object.freeze({ status, scriptMarker })
  } catch {
    return unknownOutput
  }
}

const groups = {
  PLAN: ['INPUT', 'UNISSUED_OR_CHANGED_PLAN'],
  OUTER_CORRELATION: ['OUTER_CORRELATION', 'OUTPUT_FIELDS', 'OUTPUT_NAME'],
  OUTPUT_SHAPE: ['OUTPUT_CONTENT', 'OUTPUT_MEDIA'],
  COMPLETION_HEADER: ['NOT_COMPLETED_OR_BAD_HEADER'],
  ENVELOPE: ['RESULT_BOUND', 'RESULT_JSON', 'ENVELOPE', 'ENVELOPE_CORRELATION'],
  AUDIT: ['AUDIT_REQUIRED', 'ABSENCE_DISPATCHED', 'SCOPED_AUDIT_COUNT', 'SCOPED_AUDIT_CORRELATION'],
  NESTED_RESULT: ['NESTED_RESULT_MISMATCH'],
}
const categories = new Map(
  Object.entries(groups).flatMap(([category, codes]) => codes.map(code => [`M02_CODEC_${code}`, category])),
)

export function emitDiagnostic(observe, component, category) {
  try {
    observe?.(Object.freeze({ component, category }))
  } catch {
    // Diagnostics cannot replace acceptance, refusal, fencing, or ACK behavior.
  }
}

export function decodeWithDiagnostic(input, observe) {
  try {
    return decodeCodeModeContinuation(input)
  } catch (error) {
    emitDiagnostic(observe, 'R10_CODEC', categories.get(error?.message) ?? 'OTHER')
    throw error
  }
}
