import { describe, expect, it } from 'vitest'

import {
  builtInStepDefinitions,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions'
import {
  authorizeDelegatedReceipt,
  customActionExtensionProposalSchema,
  issueDelegatedAuthorizationReceipt,
  VALIDATION_AST_LIMITS,
  validationAstSchema,
  validationAstSubmissionSchema,
} from './index'

const hash = (character: string) => `sha256:${character.repeat(64)}`
const clickDefinition = builtInStepDefinitions.find(item => item.identity.id === 'browser.mouse.click')!
const visibleDefinition = builtInStepDefinitions.find(item => item.identity.id === 'browser.assertions.visible')!
const invocation = (
  definition: (typeof builtInStepDefinitions)[number],
  inputs: Record<string, unknown>,
  keyword: 'Given' | 'When' | 'Then' | 'And',
  description: string,
) => ({
  step: {
    id: definition.identity.id,
    version: definition.identity.version,
    definitionHash: computeStepReferenceHash(definition),
  },
  inputs,
  presentation: { keyword, description },
})

const ast = {
  schemaVersion: 2,
  id: 'meditation-validation',
  title: 'Meditation workflow',
  purpose: 'Verify a meditation can be completed and persisted.',
  coversTaskIds: ['complete-meditation'],
  matrix: [{ browser: 'chromium', environmentId: 'local' }],
  scenarios: [
    {
      id: 'complete-session',
      title: 'Complete a session',
      steps: [
        {
          id: 'open-session',
          invocation: invocation(
            clickDefinition,
            { target: { ref: 'locator', id: 'start-button', version: '1' } },
            'Given',
            'Open the meditation session.',
          ),
        },
        {
          id: 'verify-session',
          invocation: invocation(
            visibleDefinition,
            { target: { ref: 'stored', name: 'created-session' } },
            'Then',
            'Verify the stored session remains available.',
          ),
        },
      ],
    },
  ],
  qualityConcerns: ['persistence', 'accessibility'],
  expectedFailures: [],
  customExtensions: ['read-session-timer'],
} as const

describe('validation AST contracts', () => {
  it('represents exact StepInvocation, locator, stored-value, matrix, concern, and extension references', () => {
    const parsed = validationAstSchema.parse(ast)
    expect(parsed.scenarios[0]!.steps[0]!.invocation.step).toMatchObject({
      id: 'browser.mouse.click',
      definitionHash: computeStepReferenceHash(clickDefinition),
    })
    expect(parsed.scenarios[0]!.steps[0]).not.toHaveProperty('action')
    expect(
      customActionExtensionProposalSchema.parse({
        schemaVersion: 2,
        id: 'read-session-timer',
        version: '1',
        title: 'Read session timer',
        description: 'Read the application timer through a project-specific API.',
        reasonExistingActionsAreInsufficient: 'The public action catalog has no timer API action.',
        inputs: [{ name: 'session-id', type: 'string', required: true }],
        outputs: [{ name: 'remaining-seconds', type: 'number' }],
        requiredCapabilities: ['page-evaluate'],
        implementation: { language: 'typescript', source: 'export async function run() { return 0 }' },
      }),
    ).toMatchObject({ id: 'read-session-timer' })
  })

  it('rejects historical operation authority, tampered definition hashes, duplicate step ids, and raw executable fields', () => {
    const withSteps = (steps: Array<(typeof ast.scenarios)[number]['steps'][number]>) => ({
      ...ast,
      scenarios: [{ ...ast.scenarios[0], steps }],
    })
    expect(validationAstSchema.safeParse({ ...ast, schemaVersion: 1 }).success).toBe(false)
    expect(
      validationAstSchema.safeParse(withSteps([ast.scenarios[0].steps[0], ast.scenarios[0].steps[0]])).success,
    ).toBe(false)
    const legacyAuthority = withSteps([
      { ...ast.scenarios[0].steps[0], operation: { id: 'browser.mouse.click', version: '1', inputs: {} } } as never,
    ])
    const alteredReference = withSteps([
      {
        ...ast.scenarios[0].steps[0],
        invocation: {
          ...ast.scenarios[0].steps[0].invocation,
          step: { ...ast.scenarios[0].steps[0].invocation.step, definitionHash: hash('d') },
        },
      },
    ])
    expect(validationAstSchema.safeParse(legacyAuthority)).toMatchObject({ success: false })
    expect(validationAstSchema.safeParse(alteredReference)).toMatchObject({ success: true })
  })

  it('accepts matrix-bound expected red baselines and validates their last passing step', () => {
    const expectedFailure = {
      browser: 'chromium' as const,
      environmentId: 'local',
      signature: 'The notes app is not reachable before implementation.',
      order: 0,
      lastPassingStepId: null,
    }
    expect(validationAstSchema.safeParse({ ...ast, expectedFailures: [expectedFailure] }).success).toBe(true)
    expect(
      validationAstSchema.safeParse({
        ...ast,
        expectedFailures: [{ ...expectedFailure, lastPassingStepId: 'missing-step' }],
      }).success,
    ).toBe(false)
    expect(
      validationAstSchema.safeParse({ ...ast, expectedFailures: [{ ...expectedFailure, environmentId: 'staging' }] })
        .success,
    ).toBe(false)
  })

  it('rejects multiline, tag, and grammar injection in AST-authored fields', () => {
    for (const injected of ['safe\nScenario: injected', '@injected', 'Scenario: injected', 'Feature: injected']) {
      expect(validationAstSchema.safeParse({ ...ast, title: injected }).success).toBe(false)
    }
    expect(validationAstSchema.safeParse({ ...ast, title: 'When persistence matters' }).success).toBe(true)
  })

  it('bounds source and rejects duplicate extension identities and declarations', () => {
    const extension = {
      schemaVersion: 2,
      id: 'read-session-timer',
      version: '1',
      title: 'Read timer',
      description: 'Read timer.',
      reasonExistingActionsAreInsufficient: 'No action exists.',
      inputs: [],
      outputs: [],
      requiredCapabilities: [],
      implementation: { language: 'typescript', source: 'export const value = true' },
    }
    expect(
      validationAstSubmissionSchema.safeParse({
        expectedPlanHash: hash('a'),
        ast,
        customExtensionProposals: [extension, extension],
      }).success,
    ).toBe(false)
    expect(
      validationAstSchema.safeParse({ ...ast, customExtensions: ['read-session-timer', 'read-session-timer'] }).success,
    ).toBe(false)
    expect(
      customActionExtensionProposalSchema.safeParse({
        ...extension,
        implementation: { language: 'typescript', source: 'x'.repeat(VALIDATION_AST_LIMITS.sourceBytes + 1) },
      }).success,
    ).toBe(false)
  })
})

describe('delegated authorization receipts', () => {
  const secret = 'test-only-secret'
  const claims = {
    version: '1',
    permittedActionClass: 'validation-ast',
    targetFingerprint: hash('a'),
    briefOrPlanHash: hash('b'),
    issuer: 'coordinator-one',
    expiresAt: '2026-07-11T12:30:00.000Z',
    nonce: 'nonce-1234567890abcdef',
    maximumPhase: 'preview',
  } as const
  const authorize = (receipt: unknown, overrides: Partial<Parameters<typeof authorizeDelegatedReceipt>[1]> = {}) =>
    authorizeDelegatedReceipt(receipt, {
      secret,
      targetFingerprint: claims.targetFingerprint,
      briefOrPlanHash: claims.briefOrPlanHash,
      actionClass: 'validation-ast',
      phase: 'preview',
      now: new Date('2026-07-11T12:00:00.000Z'),
      consumeNonce: async () => true,
      ...overrides,
    })
  it('authorizes exact scope once and rejects target, scope, phase, expiry, replay, and tampering', async () => {
    const receipt = issueDelegatedAuthorizationReceipt(claims, secret)
    await expect(authorize(receipt)).resolves.toEqual(claims)
    await expect(authorize(receipt, { targetFingerprint: hash('c') })).rejects.toThrow('target-mismatch')
    await expect(authorize(receipt, { actionClass: 'custom-extension' })).rejects.toThrow('scope-escalation')
    await expect(authorize(receipt, { phase: 'publish' })).rejects.toThrow('phase-escalation')
    await expect(authorize(receipt, { now: new Date(claims.expiresAt) })).rejects.toThrow('expired')
    await expect(authorize(receipt, { consumeNonce: async () => false })).rejects.toThrow('replay')
    await expect(authorize({ ...receipt, claims: { ...receipt.claims, issuer: 'attacker' } })).rejects.toThrow(
      'tampered',
    )
  })
})
