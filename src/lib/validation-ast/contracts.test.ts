import { describe, expect, it } from 'vitest'

import {
  authorizeDelegatedReceipt,
  customActionExtensionProposalSchema,
  issueDelegatedAuthorizationReceipt,
  validationAstSchema,
} from './index'

const hash = (character: string) => `sha256:${character.repeat(64)}`

const ast = {
  schemaVersion: '1',
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
          keyword: 'Given',
          description: 'Open the meditation session.',
          action: {
            id: 'browser-click',
            version: '1.0',
            inputs: { target: { ref: 'locator', id: 'start-button', version: '1' } },
          },
          store: { output: 'session-id', as: 'created-session' },
        },
        {
          id: 'verify-session',
          keyword: 'Then',
          description: 'Verify the stored session remains available.',
          action: {
            id: 'expect-visible',
            version: '1',
            inputs: { session: { ref: 'stored', name: 'created-session' } },
          },
        },
      ],
    },
  ],
  qualityConcerns: ['persistence', 'accessibility'],
  customExtensions: ['read-session-timer'],
} as const

describe('validation AST contracts', () => {
  it('represents action, locator, stored-value, matrix, concern, and extension references', () => {
    expect(validationAstSchema.parse(ast)).toEqual(ast)
    expect(
      customActionExtensionProposalSchema.parse({
        schemaVersion: '1',
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

  it('rejects unknown versions, duplicate step ids, and raw executable action fields', () => {
    expect(validationAstSchema.safeParse({ ...ast, schemaVersion: '2' }).success).toBe(false)
    expect(
      validationAstSchema.safeParse({
        ...ast,
        scenarios: [{ ...ast.scenarios[0], steps: [ast.scenarios[0].steps[0], ast.scenarios[0].steps[0]] }],
      }).success,
    ).toBe(false)
    expect(
      validationAstSchema.safeParse({
        ...ast,
        scenarios: [{ ...ast.scenarios[0], steps: [{ ...ast.scenarios[0].steps[0], source: 'raw code' }] }],
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
