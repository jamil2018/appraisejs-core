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
  '.agents',
]
const forbidden = [
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
]

async function filesBelow(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  const files: string[] = []
  for (const entry of entries) {
    const target = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...(await filesBelow(target)))
    else if (/\.(?:ts|tsx|mjs|md|json|ya?ml)$/.test(entry.name)) files.push(target)
  }
  return files
}

describe('quality-first clean cutover', () => {
  it('keeps removed lifecycle symbols absent from source, tests, docs, and scaffold source', async () => {
    const thisFile = fileURLToPath(import.meta.url)
    const allowedLegacyFixtureFiles = new Set(['assessment-execution-cutover-migration.test.ts'])
    const matches: string[] = []
    for (const root of roots) {
      for (const file of await filesBelow(root)) {
        if (
          path.resolve(file) === thisFile ||
          path.basename(file) === path.basename(thisFile) ||
          allowedLegacyFixtureFiles.has(path.basename(file))
        )
          continue
        const source = await fs.readFile(file, 'utf8')
        for (const pattern of forbidden) if (pattern.test(source)) matches.push(`${file}:${pattern.source}`)
      }
    }
    expect(matches).toEqual([])
  })
})
