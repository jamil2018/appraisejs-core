import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const roots = [
  'src',
  'scripts',
  'e2e',
  'packages/appraisejs/src',
  'packages/create-appraisejs/templates/base/src',
  'packages/create-appraisejs/templates/base/scripts',
  'packages/create-appraisejs/templates/base/e2e',
  'docs',
  'prisma/schema.prisma',
]
const forbidden = [
  /\bapproveQualityRequirementsAction\b/,
  /\bproposeQualityValidationDesignAction\b/,
  /\bapproveQualityValidationDesignAction\b/,
  /\bplanning_session_create\b/,
  /\bplan_create\b/,
  /\bdelegated_plan_create\b/,
  /\bbaseline_(?:start|read|stop|retry|recover|complete)\b/,
  /\bimplementation_(?:start|read|stop|complete)\b/,
  /\bprovider_run(?:s)?\b/,
  /\bQUALITY_LIFECYCLE_PENDING\b/,
  /\bappraise_resources_list\b/,
  /(?:^|[^\w-])\/plans(?:\/|\b)/,
  /\bPlan(?:Projection|TaskProjection|Revision|Event)\b/,
  /\bValidation(?:AstPublishOperation|NodePublication)\b/,
  /\bplanId\b/,
  /\bQualityPlan\b/,
  /\bqualityPlanId\b/,
  /\bAssessment(?:Run|Finding|Decision|Preparation|Execution|Status)\b/,
  /\bASSESSMENT\b/,
  /(?:^|[^\w-])\/(?:quality-plans|assessments)(?:\/|\b)/,
  /\bquality_journey_compatibility_read\b/,
  /\bcompatibilityLineage\b/,
  /\bQUALITY_JOURNEY_LEGACY_CONTROL_RETIRED\b/,
  /quality-journey-cutover-policy/,
  /\b(?:methodology_list|methodology_get|execution_consent_decide)\b/,
  /appraise:\/\/workflow\/quality-design/,
  /\bPUBLISHED_VALIDATION\b/,
]

async function filesBelow(root: string): Promise<string[]> {
  const rootStat = await fs.stat(root).catch(() => null)
  if (rootStat?.isFile()) return [root]
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  const files: string[] = []
  for (const entry of entries) {
    if (['graphify-out', 'dist', 'node_modules'].includes(entry.name)) continue
    const target = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...(await filesBelow(target)))
    else if (
      /\.(?:ts|tsx|mjs|md|json|ya?ml)$/.test(entry.name) &&
      !/\.(?:test|spec|e2e)\./.test(entry.name)
    )
      files.push(target)
  }
  return files
}

describe('quality-first clean cutover', () => {
  it('keeps removed lifecycle symbols absent from source, tests, docs, and scaffold source', async () => {
    const thisFile = fileURLToPath(import.meta.url)
    const matches: string[] = []
    for (const root of roots) {
      for (const file of await filesBelow(root)) {
        if (
          path.resolve(file) === thisFile ||
          path.basename(file) === path.basename(thisFile) ||
          path.basename(file) === 'validate-prisma-migrations.mjs' ||
          file.includes(`${path.sep}codex${path.sep}development plan${path.sep}`)
        )
          continue
        const source = await fs.readFile(file, 'utf8')
        for (const pattern of forbidden) if (pattern.test(source)) matches.push(`${file}:${pattern.source}`)
      }
    }
    expect(matches).toEqual([])
  })
})
