import { z } from 'zod'

/** Shared value validation; keep this module independent of server hashing contracts. */
const operationValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string().max(16_384),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(operationValueSchema).max(100),
    z.record(z.string().max(128), operationValueSchema),
  ]),
)

function validateBoundedValue(value: unknown, context: z.RefinementCtx) {
  const visit = (candidate: unknown, depth: number, nodes: { count: number }) => {
    nodes.count += 1
    if (nodes.count > 1_000) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Operation value exceeds 1,000 nodes.' })
      return
    }
    if (depth > 10) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Operation value exceeds depth 10.' })
      return
    }
    if (Array.isArray(candidate)) candidate.forEach(item => visit(item, depth + 1, nodes))
    else if (candidate && typeof candidate === 'object')
      Object.values(candidate as Record<string, unknown>).forEach(item => visit(item, depth + 1, nodes))
  }
  visit(value, 0, { count: 0 })
}

export const boundedOperationValueSchema = operationValueSchema.superRefine(validateBoundedValue)
