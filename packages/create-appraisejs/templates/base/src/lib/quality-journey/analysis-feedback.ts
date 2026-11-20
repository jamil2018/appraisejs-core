import { z } from 'zod'

const prefix = 'Appraise item feedback v1:\n'
const schema = z
  .object({
    general: z.string(),
    items: z.array(
      z
        .object({ kind: z.enum(['requirement', 'obligation']), id: z.string().min(1), feedback: z.string().min(1) })
        .strict(),
    ),
  })
  .strict()

type Review = {
  requirements: Array<{ requirementId: string; statement: string }>
  obligations: Array<{ obligationId: string; statement: string }>
}

export function formatAnalysisFeedback(analysis: Review, general: string, criteria: Record<string, string>) {
  const items = [
    ...analysis.requirements.map(row => ({
      kind: 'requirement' as const,
      id: row.requirementId,
      feedback: criteria[`requirement:${row.requirementId}`]?.trim() ?? '',
    })),
    ...analysis.obligations.map(row => ({
      kind: 'obligation' as const,
      id: row.obligationId,
      feedback: criteria[`obligation:${row.obligationId}`]?.trim() ?? '',
    })),
  ].filter(row => row.feedback)
  return items.length ? prefix + JSON.stringify({ general: general.trim(), items }) : general.trim()
}

/** Presentation only. Stable IDs are checked against the exact reviewed charter. */
export function parseAnalysisCriteriaFeedback(analysis: Review, feedback: string): Record<string, string> {
  const allowed = new Set([
    ...analysis.requirements.map(row => `requirement:${row.requirementId}`),
    ...analysis.obligations.map(row => `obligation:${row.obligationId}`),
  ])
  if (feedback.startsWith(prefix)) {
    try {
      const parsed = schema.parse(JSON.parse(feedback.slice(prefix.length)))
      const items = parsed.items.map(row => [`${row.kind}:${row.id}`, row.feedback] as const)
      if (new Set(items.map(([key]) => key)).size !== items.length || items.some(([key]) => !allowed.has(key)))
        return {}
      return Object.fromEntries(items)
    } catch {
      return {}
    }
  }
  // Earlier versions used a controlled statement prefix. Read them without changing immutable feedback.
  const entries = [
    ...analysis.requirements.map(row => ({
      key: `requirement:${row.requirementId}`,
      prefix: `Requirement ${row.requirementId} (${row.statement}): `,
    })),
    ...analysis.obligations.map(row => ({
      key: `obligation:${row.obligationId}`,
      prefix: `Acceptance criterion ${row.obligationId} (${row.statement}): `,
    })),
  ]
  return Object.fromEntries(
    feedback.split('\n\n').flatMap(part => {
      const row = entries.find(entry => part.startsWith(entry.prefix))
      return row ? [[row.key, part.slice(row.prefix.length)]] : []
    }),
  )
}
