export const ACTION_CATALOG_CONTRACT_VERSION = '1' as const
export const LOCATOR_GRAPH_CONTRACT_VERSION = '1' as const
export const VALIDATION_AST_SCHEMA_VERSION = 1 as const
export const DELEGATED_AUTHORIZATION_VERSION = '1' as const

export type ActionAssertionConcern = 'accessibility' | 'persistence'
export type ActionNumericUnit = 'milliseconds' | 'seconds'
export type ActionInputDescriptor = {
  name: string
  type: string
  required: boolean
  description: string
  constraints?: Record<string, unknown>
  numeric?: { unit: ActionNumericUnit; minimum?: number; maximum?: number }
}
export type ActionDescriptor = {
  id: string
  version: string
  title: string
  description: string
  categories: string[]
  inputs: ActionInputDescriptor[]
  outputs: Array<{ name: string; type: string; description: string }>
  requirements: { runtime: 'browser' | 'api' | 'node' | 'database'; capabilities: string[] }
  assertionConcerns: ActionAssertionConcern[]
  contentHash: string
}

export type ValidationAstValue =
  | string
  | number
  | boolean
  | { ref: 'locator'; id: string; version: string }
  | { ref: 'environment'; key: string }
  | { ref: 'stored'; name: string }
  | { ref: 'custom-extension'; id: string; version: string }

export type ValidationAst = {
  schemaVersion: typeof VALIDATION_AST_SCHEMA_VERSION
  id: string
  title: string
  purpose: string
  coversTaskIds: string[]
  matrix: Array<{ browser?: 'chromium' | 'firefox' | 'webkit'; environmentId: string }>
  scenarios: Array<{
    id: string
    title: string
    description?: string
    steps: Array<{
      id: string
      keyword: 'Given' | 'When' | 'Then' | 'And'
      description: string
      action: { id: string; version: string; inputs: Record<string, ValidationAstValue> }
      store?: { output: string; as: string }
    }>
  }>
  qualityConcerns: Array<'accessibility' | 'persistence' | 'responsive' | 'performance' | 'security'>
  coverageArgument?: {
    mappings: Array<{
      kind: 'task' | 'acceptance-criterion' | 'quality-concern'
      targetId: string
      scenarioIds: string[]
      stimulusStepIds: string[]
      observationStepIds: string[]
      rationale: string
      state: 'covered' | 'partial' | 'deferred' | 'uncovered'
      limitation?: string
    }>
  }
  customExtensions: string[]
}

export type CustomActionExtensionProposal = {
  schemaVersion: typeof VALIDATION_AST_SCHEMA_VERSION
  id: string
  version: string
  title: string
  description: string
  reasonExistingActionsAreInsufficient: string
  inputs: Array<{ name: string; type: string; required: boolean }>
  outputs: Array<{ name: string; type: string }>
  requiredCapabilities: string[]
  implementation: { language: 'typescript'; source: string }
}

export type ValidationAstSubmission = {
  expectedPlanHash: string
  authoringProfile?: {
    id: 'simple-happy-path'
    version: '1'
    advanced?: { matrix?: boolean; timing?: boolean }
  }
  ast: ValidationAst
  customExtensionProposals: CustomActionExtensionProposal[]
}

export type CustomExtensionPolicy = {
  version: '1'
  projectId: string
  projectFingerprint: string
  capabilityImports: Record<string, readonly string[]>
  compilerVersion: string
  declarationHash: string
  contentHash: string
}

export type CompiledCustomExtensionReview = {
  schemaVersion: '1'
  projectId: string
  projectFingerprint: string
  extension: Pick<CustomActionExtensionProposal, 'id' | 'version' | 'title' | 'description' | 'inputs' | 'outputs'>
  requiredCapabilities: string[]
  imports: Array<{ requested: string; compiled: string }>
  source: string
  compiledSource: string
  sourceHash: string
  compiledHash: string
  cucumberModulePath: string
}

export type ValidationAstExtensionReviewResult = {
  planId: string
  operationId: string
  operationHash: string
  decisionBindingHash: string
  receiptHash: string
  extensions: CompiledCustomExtensionReview[]
}

export type DelegatedAuthorizationReceipt = {
  claims: {
    version: typeof DELEGATED_AUTHORIZATION_VERSION
    permittedActionClass: 'validation-ast' | 'custom-extension'
    targetFingerprint: string
    briefOrPlanHash: string
    issuer: string
    expiresAt: string
    nonce: string
    maximumPhase: 'check' | 'preview' | 'publish'
  }
  signature: string
}
