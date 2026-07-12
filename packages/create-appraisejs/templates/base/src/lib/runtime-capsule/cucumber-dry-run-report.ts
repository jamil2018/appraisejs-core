import { z } from 'zod'
import type { CapsuleCommandReceiptV1 } from './command-receipt-contract'

const reportSchema = z.array(
  z
    .object({
      elements: z
        .array(
          z
            .object({
              name: z.string(),
              tags: z.array(z.object({ name: z.string() }).passthrough()).default([]),
              steps: z
                .array(z.object({ result: z.object({ status: z.string() }).passthrough() }).passthrough())
                .default([]),
            })
            .passthrough(),
        )
        .default([]),
    })
    .passthrough(),
)

export function parseAndReconcileCucumberDryRun(
  bytes: Buffer,
  selection: CapsuleCommandReceiptV1['selection'],
  maxBytes: number,
) {
  if (bytes.byteLength > maxBytes) throw new Error('Dry-run report exceeds its sealed byte limit.')
  const scenarios = reportSchema.parse(JSON.parse(bytes.toString('utf8'))).flatMap(feature => feature.elements)
  const expected = new Map(selection.expectedCases.map(item => [`@tc_${item.caseId}`, item]))
  const matched = new Set<string>()
  for (const scenario of scenarios) {
    const tags = new Set(scenario.tags.map(tag => tag.name))
    const caseTags = [...tags].filter(tag => expected.has(tag))
    if (caseTags.length !== 1) throw new Error('Dry-run scenario does not have exactly one expected case tag.')
    const caseTag = caseTags[0]!
    if (matched.has(caseTag)) throw new Error('Dry-run contains a duplicate expected scenario.')
    const item = expected.get(caseTag)!
    for (const required of [`@appraise_validation_${item.validationId}`, `@ts_${item.suiteId}`, caseTag])
      if (!tags.has(required)) throw new Error('Dry-run scenario identifier tags do not match expected evidence.')
    if (scenario.steps.some(step => ['ambiguous', 'failed', 'undefined'].includes(step.result.status.toLowerCase())))
      throw new Error('Dry-run contains undefined, ambiguous, or failed steps.')
    matched.add(caseTag)
  }
  if (
    matched.size === 0 ||
    matched.size !== expected.size ||
    matched.size !== selection.expectedScenarioCount ||
    matched.size !== selection.expectedCaseCount
  )
    throw new Error('Dry-run selected scenario count or expected case set differs.')
  return { selectedScenarioCount: matched.size }
}
