import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { previewLegacyAutomationImport } from './legacy-import'

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'appraise-legacy-import-'))
  await mkdir(path.join(root, 'automation/features/account'), { recursive: true })
  await mkdir(path.join(root, 'automation/steps'), { recursive: true })
  await mkdir(path.join(root, 'automation/locators/account'), { recursive: true })
  await writeFile(
    path.join(root, 'automation/features/account/login.feature'),
    '@smoke\nFeature: Account login\n  Scenario: Login succeeds\n    Given the login page is open\n    When the user signs in\n    Then the dashboard is visible\n',
  )
  await writeFile(
    path.join(root, 'automation/steps/login.steps.ts'),
    "Given('the login page is open', async () => {})\nWhen(/the user signs in/, async () => {})\n",
  )
  await writeFile(
    path.join(root, 'automation/locators/account/login.json'),
    JSON.stringify({ 'Sign in': '[data-testid=sign-in]' }),
  )
  return root
}

describe('legacy automation import preview', () => {
  it('returns a deterministic non-mutating proposal with source traceability and unresolved mappings', async () => {
    const root = await fixture()
    const first = await previewLegacyAutomationImport(root)
    const second = await previewLegacyAutomationImport(root)

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      reviewStatus: 'human-review-required',
      mutationPerformed: false,
      sourceRoot: 'automation',
    })
    expect(first.sources.map(source => source.path)).toEqual([
      'automation/features/account/login.feature',
      'automation/locators/account/login.json',
      'automation/steps/login.steps.ts',
    ])
    expect(first.features[0]?.scenarios[0]?.steps).toHaveLength(3)
    expect(first.features[0]?.scenarios[0]?.steps[0]?.actionMapping).toBe('unresolved')
    expect(first.stepDefinitions[0]?.expressions).toEqual(['the login page is open', 'the user signs in'])
    expect(first.locators[0]).toMatchObject({ name: 'Sign in', mapping: 'unresolved' })
    expect(first.warnings).toContain('3 legacy steps require explicit action-catalog mapping.')
  })

  it('returns a reviewable empty proposal when automation is absent', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'appraise-empty-import-'))
    const proposal = await previewLegacyAutomationImport(root)
    expect(proposal.features).toEqual([])
    expect(proposal.warnings).toContain('No legacy feature files were found.')
  })

  it('rejects a symlinked automation root', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'appraise-linked-import-'))
    const external = await mkdtemp(path.join(os.tmpdir(), 'appraise-linked-source-'))
    await symlink(external, path.join(root, 'automation'))
    await expect(previewLegacyAutomationImport(root)).rejects.toThrow('symlinked automation root')
  })
})
