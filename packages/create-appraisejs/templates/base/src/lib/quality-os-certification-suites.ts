import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const qualityOsBaseBehavioralSuites = [
  'src/lib/quality-design/methodology-registry.test.ts',
  'src/services/coordinator/quality-operating-system-service.test.ts',
  'src/services/coordinator/assessment-execution-service.test.ts',
  'src/services/coordinator/assessment-preparation-service.test.ts',
  'src/services/coordinator/quality-design-service.test.ts',
  'src/services/coordinator/quality-journey-analysis-service.sqlite.integration.test.ts',
  'src/services/coordinator/quality-journey-triage-service.sqlite.integration.test.ts',
  'src/services/coordinator/quality-journey-triage-validation.test.ts',
  'src/services/coordinator/quality-journey-triage-evidence-service.test.ts',
  'src/lib/quality-journey/triage-contracts.test.ts',
  'src/services/coordinator/quality-journey-closure-validation.test.ts',
  'src/services/coordinator/quality-journey-artifact-library-service.test.ts',
  'src/app/(base)/quality-journeys/[journeyId]/closure-actions.test.ts',
  'src/app/(base)/quality-journeys/[journeyId]/closure-panel.test.tsx',
  'src/app/api/internal/coordinator/[...operation]/quality-journey-library-route.test.ts',
  'src/app/api/internal/coordinator/[...operation]/route.test.ts',
  'src/app/(base)/quality-journeys/[journeyId]/scenario-portfolio-review.test.tsx',
] as const

/** Cross-package parity only exists in the AppraiseJS producer repository. */
const repositoryOnlyQualityOsBehavioralSuites = [
  'src/lib/quality-journey/automation-contracts.mcp-parity.test.ts',
  'src/lib/quality-journey/scenario-contracts.mcp-parity.test.ts',
] as const

export function resolveQualityOsBehavioralSuites(rootDirectory: string): string[] {
  return [
    ...qualityOsBaseBehavioralSuites,
    ...repositoryOnlyQualityOsBehavioralSuites.filter(file => existsSync(resolve(rootDirectory, file))),
  ]
}
