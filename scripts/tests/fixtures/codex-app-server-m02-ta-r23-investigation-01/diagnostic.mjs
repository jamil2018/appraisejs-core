/** Offline diagnostic prototype. It changes no acceptance predicate and retains no error/output data. */
import { decodeCodeModeContinuation } from '../codex-app-server-m02-ta-codec-r10/codec.mjs'

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

export function decodeWithOfflineDiagnostic(input, observe) {
  try {
    return decodeCodeModeContinuation(input)
  } catch (error) {
    // Exact trusted constants only. Never persist text, stacks, hashes or provider shape summaries.
    const category = categories.get(error?.message) ?? 'OTHER'
    try {
      observe(
        Object.freeze({ schema: 'appraise.m02-offline-continuation-diagnostic/v1', component: 'R10_CODEC', category }),
      )
    } catch {
      // Diagnostic failure cannot replace the original refusal.
    }
    throw error
  }
}
