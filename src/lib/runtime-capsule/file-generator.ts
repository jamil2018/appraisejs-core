import type { ValidationArtifact } from '@/lib/plan-contract'

type ValidationNode = ValidationArtifact['validations'][number]

function assertSingleLineGherkin(value: string, label: string) {
  if (/\r|\n|\u2028|\u2029/.test(value)) throw new Error(`${label} must be a single Gherkin line.`)
}

export function generateReviewedFeature(node: ValidationNode) {
  const suiteByCase = new Map(node.appraiseArtifacts.testSuites.flatMap(s => s.testCaseIds.map(id => [id, s.id])))
  assertSingleLineGherkin(node.appraiseArtifacts.testSuites[0]?.name ?? node.id, 'Feature title')
  for (const testCase of node.appraiseArtifacts.testCases) {
    assertSingleLineGherkin(testCase.title, 'Scenario title')
    for (const step of testCase.steps) {
      assertSingleLineGherkin(step.gherkinStep, 'Step text')
      if (!/^(?:Given|When|Then|And|But)\s+\S/.test(step.gherkinStep))
        throw new Error('Step text must begin with an allowed Gherkin keyword.')
    }
  }
  return [
    `Feature: ${node.appraiseArtifacts.testSuites[0]?.name ?? node.id}`,
    '',
    ...node.appraiseArtifacts.testCases.flatMap(testCase => [
      `  @appraise_validation_${node.id} @ts_${suiteByCase.get(testCase.id)} @tc_${testCase.id}`,
      `  Scenario: ${testCase.title}`,
      ...[...testCase.steps].sort((left, right) => left.order - right.order).map(step => `    ${step.gherkinStep}`),
      '',
    ]),
  ].join('\n')
}

export function generateCucumberConfig(input: {
  featurePath: string
  imports: string[]
  canonicalJson(value: unknown): string
}) {
  const base = { paths: [input.featurePath], import: input.imports, publishQuiet: true }
  return `export default ${input.canonicalJson({ ...base, format: ['json:reports/cucumber.json'] })}\nexport const preflight = ${input.canonicalJson({ ...base, format: ['json:reports/preflight.json'] })}\n`
}

export function generateSupportFiles(runtimeImport: string, hooksImport: string) {
  return [
    {
      path: 'support/world.mjs',
      role: 'support' as const,
      bytes: Buffer.from(`export { CustomWorld } from '${runtimeImport}'\n`),
    },
    {
      path: 'support/hooks.mjs',
      role: 'support' as const,
      bytes: Buffer.from(`import '${hooksImport}'\n`),
    },
  ]
}
