import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import YAML from 'yaml'

import { validateReleaseCiWorkflow } from '../check-release-ci.mjs'

const scriptsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const fixture = name => YAML.parse(fs.readFileSync(path.join(scriptsDir, 'fixtures', name), 'utf8'))
const dependabot = {
  updates: [
    { 'package-ecosystem': 'npm', directory: '/' },
    { 'package-ecosystem': 'npm', directory: '/packages/appraisejs' },
    { 'package-ecosystem': 'npm', directory: '/packages/create-appraisejs' },
  ],
}

test('release CI rejects a workflow without the ordered harness gate', () => {
  assert.throws(
    () => validateReleaseCiWorkflow(fixture('ci-missing-harness.yml'), dependabot),
    /Root CI must run the harness check after root\/package dependency installation/,
  )
})

test('release CI rejects a workflow without the capsule-only cutover gate', () => {
  const workflow = fixture('ci-missing-harness.yml')
  workflow.jobs['root-app'].steps.splice(2, 0, { run: 'npm run check:harness' })

  assert.throws(
    () => validateReleaseCiWorkflow(workflow, dependabot),
    /Security CI must enforce the capsule-only cutover guard/,
  )
})

test('release CI rejects a workflow without the Quality OS certification gate', () => {
  const workflow = fixture('ci-missing-harness.yml')
  workflow.jobs['root-app'].steps.splice(2, 0, { run: 'npm run check:harness' })
  workflow.jobs['security-and-quality'].steps.push({ run: 'npm run release:check:capsule-cutover' })

  assert.throws(
    () => validateReleaseCiWorkflow(workflow, dependabot),
    /Security CI must enforce the Quality OS planner certification gate/,
  )
})
