import { describe, expect, it } from 'vitest'
import { canonicalRuntimeCapsuleJson } from './contracts'
import { generateCucumberConfig, generateReviewedFeature, generateSupportFiles } from './file-generator'

describe('runtime capsule file generators', () => {
  it('generates exact reviewed tags and rejects multiline Gherkin fields', () => {
    const node: Parameters<typeof generateReviewedFeature>[0] = {
      id: 'validation',
      taskIds: ['task'],
      required: true,
      testCaseIds: ['case'],
      appraiseArtifacts: {
        modules: [{ id: 'module', name: 'Module' }],
        testSuites: [{ id: 'suite', name: 'Feature', moduleId: 'module', testCaseIds: ['case'] }],
        testCases: [
          {
            id: 'case',
            title: 'Scenario',
            description: '',
            steps: [{ id: 'step', order: 0, label: 'Run', gherkinStep: 'When it runs', parameters: [] }],
          },
        ],
        locatorGroups: [],
        locators: [],
      },
      gherkinPaths: ['features/case.feature'],
      stepPaths: [],
      executable: { path: 'features/case.feature' },
      matrix: [{ browser: 'chromium', environment: 'local' }],
      expectedFailures: [],
    }
    expect(generateReviewedFeature(node)).toContain('@appraise_validation_validation @ts_suite @tc_case')
    expect(() =>
      generateReviewedFeature({
        ...node,
        appraiseArtifacts: {
          ...node.appraiseArtifacts,
          testSuites: [{ ...node.appraiseArtifacts.testSuites[0], name: 'bad\nScenario: injected' }],
        },
      }),
    ).toThrow(/single Gherkin line/)
  })

  it('emits default and named preflight ESM profiles', () => {
    const source = generateCucumberConfig({
      featurePath: 'features/a.feature',
      imports: ['bindings/a.mjs'],
      canonicalJson: canonicalRuntimeCapsuleJson,
    })
    expect(source).toContain('export default')
    expect(source).toContain('export const preflight')
    const support = generateSupportFiles('file:///runtime.js', 'file:///hooks.js')
    expect(support.map(file => file.path)).toEqual(['support/world.mjs', 'support/hooks.mjs'])
    expect(support.find(file => file.path === 'support/hooks.mjs')?.bytes.toString()).toBe(
      "import 'file:///hooks.js'\n",
    )
  })
})
