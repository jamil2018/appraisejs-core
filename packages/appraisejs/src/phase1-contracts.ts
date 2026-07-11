export const ACTION_CATALOG_CONTRACT_VERSION = '1' as const
export const LOCATOR_GRAPH_CONTRACT_VERSION = '1' as const
export const VALIDATION_AST_SCHEMA_VERSION = '1' as const
export const DELEGATED_AUTHORIZATION_VERSION = '1' as const

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
  ast: ValidationAst
  customExtensionProposals: CustomActionExtensionProposal[]
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
