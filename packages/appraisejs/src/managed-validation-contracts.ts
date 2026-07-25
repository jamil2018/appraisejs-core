export const OPERATION_CATALOG_CONTRACT_VERSION = '1' as const
export const LOCATOR_GRAPH_CONTRACT_VERSION = '1' as const
export const VALIDATION_AST_SCHEMA_VERSION = 2 as const
export const DELEGATED_AUTHORIZATION_VERSION = '1' as const

export const VALIDATION_AST_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'appraise://contracts/validation-ast/v2',
  title: 'Appraise managed Validation AST submission',
  type: 'object',
  additionalProperties: false,
  required: ['expectedPlanHash', 'ast', 'customExtensionProposals'],
  properties: {
    expectedPlanHash: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
    stepDefinitionSelections: {
      type: 'array',
      minItems: 1,
      maxItems: 32,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['receiptId', 'correlationId'],
        properties: {
          receiptId: { type: 'string', format: 'uuid' },
          correlationId: { type: 'string', maxLength: 100, pattern: '^[a-zA-Z0-9._:-]+$' },
        },
      },
    },
    authoringProfile: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'version'],
      properties: {
        id: { const: 'simple-happy-path' },
        version: { const: '1' },
        advanced: {
          type: 'object',
          additionalProperties: false,
          properties: { matrix: { type: 'boolean' }, timing: { type: 'boolean' } },
        },
      },
    },
    ast: { $ref: '#/$defs/ast' },
    customExtensionProposals: { type: 'array', maxItems: 8, items: { $ref: '#/$defs/extension' } },
  },
  $defs: {
    id: { type: 'string', maxLength: 80, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
    value: {
      oneOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'null' },
        { type: 'array', maxItems: 100, items: { $ref: '#/$defs/value' } },
        {
          type: 'object',
          maxProperties: 100,
          additionalProperties: { $ref: '#/$defs/value' },
          not: { required: ['ref'] },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'id', 'version'],
          properties: { ref: { const: 'locator' }, id: { type: 'string' }, version: { type: 'string' } },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'key'],
          properties: { ref: { const: 'environment' }, key: { $ref: '#/$defs/id' } },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'name'],
          properties: { ref: { const: 'stored' }, name: { $ref: '#/$defs/id' } },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'id', 'version'],
          properties: {
            ref: { const: 'custom-extension' },
            id: { $ref: '#/$defs/id' },
            version: { type: 'string' },
          },
        },
      ],
    },
    stepReference: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'version', 'definitionHash'],
      properties: {
        id: { type: 'string' },
        version: { type: 'string' },
        definitionHash: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
      },
    },
    invocation: {
      type: 'object',
      additionalProperties: false,
      required: ['step', 'inputs', 'presentation'],
      properties: {
        step: { $ref: '#/$defs/stepReference' },
        inputs: { type: 'object', additionalProperties: { $ref: '#/$defs/value' }, maxProperties: 32 },
        store: {
          type: 'object',
          additionalProperties: false,
          required: ['output', 'as'],
          properties: { output: { $ref: '#/$defs/id' }, as: { $ref: '#/$defs/id' } },
        },
        presentation: {
          type: 'object',
          additionalProperties: false,
          required: ['keyword'],
          properties: {
            keyword: { enum: ['Given', 'When', 'Then', 'And'] },
            description: { type: 'string', minLength: 1, maxLength: 2000, pattern: '^[^\\r\\n]*$' },
          },
        },
      },
    },
    step: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'invocation'],
      properties: {
        id: { $ref: '#/$defs/id' },
        invocation: { $ref: '#/$defs/invocation' },
      },
    },
    ast: {
      type: 'object',
      additionalProperties: false,
      required: [
        'schemaVersion',
        'id',
        'title',
        'purpose',
        'coversTaskIds',
        'matrix',
        'scenarios',
        'qualityConcerns',
        'customExtensions',
      ],
      properties: {
        schemaVersion: { const: 2 },
        id: { $ref: '#/$defs/id' },
        title: { type: 'string', minLength: 1, maxLength: 120 },
        purpose: { type: 'string', minLength: 1, maxLength: 2000 },
        coversTaskIds: { type: 'array', minItems: 1, maxItems: 100, items: { $ref: '#/$defs/id' } },
        matrix: {
          type: 'array',
          minItems: 1,
          maxItems: 12,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['environmentId'],
            properties: { browser: { enum: ['chromium', 'firefox', 'webkit'] }, environmentId: { $ref: '#/$defs/id' } },
          },
        },
        scenarios: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'title', 'steps'],
            properties: {
              id: { $ref: '#/$defs/id' },
              title: { type: 'string' },
              description: { type: 'string' },
              steps: { type: 'array', minItems: 1, maxItems: 100, items: { $ref: '#/$defs/step' } },
            },
          },
        },
        qualityConcerns: {
          type: 'array',
          uniqueItems: true,
          items: { enum: ['accessibility', 'persistence', 'responsive', 'performance', 'security'] },
        },
        expectedFailures: { type: 'array', maxItems: 12 },
        coverageArgument: { type: 'object' },
        customExtensions: { type: 'array', maxItems: 8, items: { $ref: '#/$defs/id' } },
      },
    },
    extension: {
      type: 'object',
      additionalProperties: false,
      required: [
        'schemaVersion',
        'id',
        'version',
        'title',
        'description',
        'reasonExistingActionsAreInsufficient',
        'inputs',
        'outputs',
        'requiredCapabilities',
        'implementation',
      ],
      properties: {
        schemaVersion: { const: 2 },
        id: { $ref: '#/$defs/id' },
        version: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        reasonExistingActionsAreInsufficient: { type: 'string' },
        inputs: { type: 'array' },
        outputs: { type: 'array' },
        requiredCapabilities: { type: 'array', items: { $ref: '#/$defs/id' } },
        implementation: {
          type: 'object',
          required: ['language', 'source'],
          properties: { language: { const: 'typescript' }, source: { type: 'string', minLength: 1 } },
        },
      },
    },
  },
} as const

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
  | null
  | ValidationAstValue[]
  | { [key: string]: ValidationAstValue }
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
      invocation: {
        step: { id: string; version: string; definitionHash: string }
        inputs: Record<string, ValidationAstValue>
        store?: { output: string; as: string }
        presentation: { keyword: 'Given' | 'When' | 'Then' | 'And'; description?: string }
      }
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
  stepDefinitionSelections?: Array<{ receiptId: string; correlationId: string }>
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
