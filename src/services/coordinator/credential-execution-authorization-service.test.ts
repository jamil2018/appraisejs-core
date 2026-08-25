import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { CredentialExecutionAuthorizationIssuer } from '@prisma/client'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  builtInStepDefinitions,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'

const { database } = vi.hoisted(() => {
  const database = {
    environment: { findUnique: vi.fn() },
    assessment: { findUnique: vi.fn() },
    assessmentExecutionRequest: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    assessmentExecutionAuthorizationGrant: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    credentialAuthorizationUiSession: { findUnique: vi.fn() },
  }
  return {
    database: {
      ...database,
      $transaction: vi.fn(async (callback: (client: typeof database) => unknown) => callback(database)),
    },
  }
})

vi.mock('@/config/db-config', () => ({ default: database }))

import {
  consumeCredentialExecutionGrant,
  credentialAuthorizationInput,
  ensureCredentialExecutionRequest,
  issueHostAssertionGrant,
  issueLocalUiGrant,
  localUiGrantForSession,
  revokeCredentialExecutionGrant,
} from './credential-execution-authorization-service'

const sha = (suffix: string) => `sha256:${suffix.padEnd(64, 'a').slice(0, 64)}`
const valueHash = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`
const scope = {
  targetProjectId: 'target-1',
  assessmentId: 'assessment-1',
  qualityPlanId: 'plan-1',
  qualityPlanRevisionId: 'revision-1',
  evaluationSubjectRevisionId: 'subject-1',
  subjectDigest: sha('subject'),
  environmentId: 'environment-1',
  publicationFingerprint: sha('publication'),
  runtimeInputHash: sha('runtime'),
  bindings: [{ slot: 'case-1:step-1:password', reference: 'environment:password' }],
  requestHash: sha('execution'),
}

const configuredCredentialDefinition = builtInStepDefinitions.find(
  definition => definition.identity.id === 'browser.forms.fill.configured.credential',
)!
const ordinaryFillDefinition = builtInStepDefinitions.find(
  definition => definition.identity.id === 'browser.forms.fill',
)!

function rootInvocation(
  definition: (typeof builtInStepDefinitions)[number],
  inputs: Record<string, unknown>,
  hash = computeStepReferenceHash(definition),
) {
  return {
    caseId: 'case-1',
    stepId: 'step-1',
    invocation: {
      step: { id: definition.identity.id, version: definition.identity.version, definitionHash: hash },
      inputs,
    },
  }
}

function base64(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

describe('credential execution authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    database.assessment.findUnique.mockResolvedValue({
      targetProjectId: scope.targetProjectId,
      qualityPlanId: scope.qualityPlanId,
      qualityPlanRevisionId: scope.qualityPlanRevisionId,
      evaluationSubjectRevisionId: scope.evaluationSubjectRevisionId,
    })
    database.environment.findUnique.mockResolvedValue({ targetProjectId: scope.targetProjectId })
    database.assessmentExecutionRequest.findFirst.mockResolvedValue(null)
    database.assessmentExecutionRequest.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'request-1',
        requestHash: data.requestHash,
        expiresAt: data.expiresAt,
        ...data,
      }),
    )
  })

  afterEach(() => {
    delete process.env.APPRAISE_HOST_ASSERTION_TRUST_FILE
  })

  it('derives the environment password only from an exact configured-credential invocation', () => {
    const input = credentialAuthorizationInput({
      ...scope,
      publications: [
        {
          generationId: 'generation-1',
          publicationId: 'publication-1',
          operationHash: sha('operation'),
          runtimeInputHash: sha('input'),
          runtimeInputJson: JSON.stringify({
            rootInvocations: [rootInvocation(configuredCredentialDefinition, { target: 'locator-password' })],
          }),
        },
      ],
    })

    expect(input.bindings).toEqual([{ slot: 'case-1:step-1:password', reference: 'environment:password' }])
  })

  it('does not derive a binding from ordinary fills, malformed references, or forged operation identity', () => {
    const runtimeInput = (rootInvocations: unknown[]) =>
      credentialAuthorizationInput({
        ...scope,
        publications: [
          {
            generationId: 'generation-1',
            publicationId: 'publication-1',
            operationHash: sha('operation'),
            runtimeInputHash: sha('input'),
            runtimeInputJson: JSON.stringify({ rootInvocations }),
          },
        ],
      })

    expect(
      runtimeInput([rootInvocation(ordinaryFillDefinition, { target: 'locator', value: 'plain' })]).bindings,
    ).toEqual([])
    expect(
      runtimeInput([
        rootInvocation(ordinaryFillDefinition, {
          target: { ref: 'environment', key: 'password', extra: true },
          value: 'plain',
        }),
      ]).bindings,
    ).toEqual([])
    expect(
      runtimeInput([rootInvocation(ordinaryFillDefinition, { target: 'locator', value: 'env:password' })]).bindings,
    ).toEqual([])
    expect(
      runtimeInput([rootInvocation(configuredCredentialDefinition, { target: 'locator-password' }, sha('forged'))])
        .bindings,
    ).toEqual([])
    expect(
      runtimeInput([
        {
          ...rootInvocation(ordinaryFillDefinition, { target: 'locator', value: 'plain' }),
          invocation: {
            step: {
              id: configuredCredentialDefinition.identity.id,
              version: configuredCredentialDefinition.identity.version,
              definitionHash: computeStepReferenceHash(ordinaryFillDefinition),
            },
            inputs: { target: 'locator-password' },
          },
        },
      ]).bindings,
    ).toEqual([])
  })

  it('retains exact published environment references and rejects conflicting stable slots', () => {
    const exact = credentialAuthorizationInput({
      ...scope,
      publications: [
        {
          generationId: 'generation-1',
          publicationId: 'publication-1',
          operationHash: sha('operation'),
          runtimeInputHash: sha('input'),
          runtimeInputJson: JSON.stringify({
            rootInvocations: [
              rootInvocation(ordinaryFillDefinition, {
                target: 'locator',
                value: { ref: 'environment', key: 'password' },
              }),
            ],
          }),
        },
      ],
    })
    expect(exact.bindings).toEqual([{ slot: 'case-1:step-1:value', reference: 'environment:password' }])

    expect(() =>
      credentialAuthorizationInput({
        ...scope,
        publications: [
          {
            generationId: 'generation-1',
            publicationId: 'publication-1',
            operationHash: sha('operation'),
            runtimeInputHash: sha('input'),
            runtimeInputJson: JSON.stringify({
              rootInvocations: [
                rootInvocation(ordinaryFillDefinition, {
                  target: 'locator',
                  value: { ref: 'environment', key: 'password' },
                }),
                {
                  ...rootInvocation(ordinaryFillDefinition, {
                    target: 'locator',
                    value: { ref: 'environment', key: 'token' },
                  }),
                },
              ],
            }),
          },
        ],
      }),
    ).toThrow('ambiguous published environment bindings')
  })

  it('fails closed rather than fabricating a credential binding', async () => {
    await expect(ensureCredentialExecutionRequest({ ...scope, bindings: [] })).rejects.toThrow(
      'exact published environment password binding',
    )
    expect(database.$transaction).not.toHaveBeenCalled()
  })

  it('reuses only an active exact request and issues a fresh opaque request after retirement', async () => {
    const active = { id: 'active-request', requestHash: sha('active'), expiresAt: new Date(Date.now() + 60_000) }
    database.assessmentExecutionRequest.findFirst.mockResolvedValueOnce(active).mockResolvedValueOnce(null)
    await expect(ensureCredentialExecutionRequest(scope)).resolves.toBe(active)
    const retired = await ensureCredentialExecutionRequest(scope)
    expect(retired.id).toBe('request-1')
    const create = database.assessmentExecutionRequest.create.mock.calls[0]![0] as { data: Record<string, unknown> }
    expect(create.data.requestHash).not.toBe(scope.requestHash)
    expect(create.data.canonicalRequestJson).not.toContain('env:')
    expect(create.data.canonicalRequestJson).not.toContain('secret')
  })

  it('retires an active request when its only unconsumed grant expired, then creates a fresh request', async () => {
    database.assessmentExecutionRequest.findFirst.mockResolvedValue({
      id: 'expired-request',
      grants: [{ expiresAt: new Date(Date.now() - 1_000), consumedAt: null, revokedAt: null }],
    })
    database.assessmentExecutionRequest.updateMany.mockResolvedValue({ count: 1 })
    await expect(ensureCredentialExecutionRequest(scope)).resolves.toMatchObject({ id: 'request-1' })
    expect(database.assessmentExecutionRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ activeScopeKey: null }) }),
    )
  })

  it('never returns a host, other-session, expired, revoked, or consumed grant to a local UI session', async () => {
    database.credentialAuthorizationUiSession.findUnique.mockResolvedValue({
      id: 'session-1',
      targetProjectId: scope.targetProjectId,
      csrfTokenHash: valueHash('csrf'),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    })
    database.assessmentExecutionAuthorizationGrant.findUnique.mockResolvedValue({
      id: 'host-grant',
      issuerKind: CredentialExecutionAuthorizationIssuer.HOST_ASSERTION,
      localUiSessionId: null,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      revokedAt: null,
    })
    await expect(
      localUiGrantForSession({
        requestId: 'request-1',
        targetProjectId: scope.targetProjectId,
        sessionToken: 'session',
        csrfToken: 'csrf',
      }),
    ).resolves.toBeNull()
  })

  it('retires a stale local grant instead of replaying it', async () => {
    database.credentialAuthorizationUiSession.findUnique.mockResolvedValue({
      id: 'session-1',
      targetProjectId: scope.targetProjectId,
      csrfTokenHash: valueHash('csrf'),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    })
    database.assessmentExecutionRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      assessmentId: scope.assessmentId,
      targetProjectId: scope.targetProjectId,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    })
    database.assessmentExecutionAuthorizationGrant.findUnique.mockResolvedValue({
      id: 'expired-grant',
      issuerKind: CredentialExecutionAuthorizationIssuer.LOCAL_UI_SESSION,
      localUiSessionId: 'session-1',
      notBefore: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() - 1_000),
      consumedAt: null,
      revokedAt: null,
    })
    database.assessmentExecutionRequest.updateMany.mockResolvedValue({ count: 1 })
    await expect(
      issueLocalUiGrant({
        requestId: 'request-1',
        assessmentId: scope.assessmentId,
        targetProjectId: scope.targetProjectId,
        sessionToken: 'session',
        csrfToken: 'csrf',
      }),
    ).rejects.toThrow('AUTHORIZATION_EXPIRED')
    expect(database.assessmentExecutionRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ activeScopeKey: null }) }),
    )
  })

  it('rejects a request when the target Assessment no longer owns its asserted scope', async () => {
    database.assessment.findUnique.mockResolvedValue({
      targetProjectId: 'foreign-target',
      qualityPlanId: scope.qualityPlanId,
      qualityPlanRevisionId: scope.qualityPlanRevisionId,
      evaluationSubjectRevisionId: scope.evaluationSubjectRevisionId,
    })
    await expect(ensureCredentialExecutionRequest(scope)).rejects.toThrow('scope no longer matches')
    expect(database.assessmentExecutionRequest.create).not.toHaveBeenCalled()
  })

  it('uses the compare-and-set result to deny an already consumed grant', async () => {
    const transaction = {
      assessmentExecutionAuthorizationGrant: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'grant-1',
          requestId: 'request-1',
          notBefore: new Date(Date.now() - 1_000),
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
          consumedAt: null,
          request: { requestHash: sha('request'), expiresAt: new Date(Date.now() + 60_000), revokedAt: null },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    }
    await expect(
      consumeCredentialExecutionGrant(transaction as never, {
        grantId: 'grant-1',
        requestId: 'request-1',
        requestHash: sha('request'),
      }),
    ).rejects.toThrow('AUTHORIZATION_ALREADY_CONSUMED')
  })

  it('revokes atomically and makes an identical revocation replay idempotent', async () => {
    database.assessmentExecutionAuthorizationGrant.findUnique.mockResolvedValue({
      id: 'grant-1',
      requestId: 'request-1',
      issuerKind: CredentialExecutionAuthorizationIssuer.HOST_ASSERTION,
      consumedAt: null,
      revokedAt: null,
    })
    database.assessmentExecutionAuthorizationGrant.updateMany.mockResolvedValue({ count: 1 })
    database.assessmentExecutionRequest.updateMany.mockResolvedValue({ count: 1 })
    await expect(
      revokeCredentialExecutionGrant({
        grantId: 'grant-1',
        reason: 'operator request',
        expectedIssuer: CredentialExecutionAuthorizationIssuer.HOST_ASSERTION,
      }),
    ).resolves.toMatchObject({
      grantId: 'grant-1',
    })
    expect(database.assessmentExecutionRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'request-1', revokedAt: null } }),
    )
  })

  it('accepts a valid Ed25519 host assertion without echoing assertion content', async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'appraise-host-trust-'))
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const current = Math.floor(Date.now() / 1_000)
    await writeFile(
      path.join(temp, 'trust.json'),
      JSON.stringify({
        version: 1,
        audience: 'appraise-test',
        keys: [
          {
            issuer: 'test-host',
            kid: 'key-1',
            publicKeyJwk: publicKey.export({ format: 'jwk' }),
            validFrom: new Date((current - 60) * 1_000).toISOString(),
            signingEndsAt: new Date((current + 60) * 1_000).toISOString(),
            verificationEndsAt: new Date((current + 60) * 1_000).toISOString(),
          },
        ],
      }),
    )
    process.env.APPRAISE_HOST_ASSERTION_TRUST_FILE = path.join(temp, 'trust.json')
    const request = {
      id: 'request-1',
      requestHash: sha('request'),
      targetProjectId: scope.targetProjectId,
      assessmentId: scope.assessmentId,
      qualityPlanId: scope.qualityPlanId,
      qualityPlanRevisionId: scope.qualityPlanRevisionId,
      evaluationSubjectRevisionId: scope.evaluationSubjectRevisionId,
      subjectDigest: scope.subjectDigest,
      environmentId: scope.environmentId,
      publicationFingerprint: scope.publicationFingerprint,
      runtimeInputHash: scope.runtimeInputHash,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      bindings: scope.bindings,
    }
    database.assessmentExecutionRequest.findUnique.mockResolvedValue(request)
    database.assessmentExecutionAuthorizationGrant.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    database.assessmentExecutionAuthorizationGrant.create.mockResolvedValue({
      id: 'grant-1',
      expiresAt: new Date(Date.now() + 60_000),
      issuerKind: 'HOST_ASSERTION',
    })
    const header = base64({ alg: 'EdDSA', kid: 'key-1', typ: 'appraise-credential-execution+jwt' })
    const payload = base64({
      iss: 'test-host',
      sub: scope.subjectDigest,
      aud: 'appraise-test',
      iat: current,
      nbf: current - 1,
      exp: current + 30,
      jti: 'jti-1',
      authorization: {
        schema: 'appraise.credential-execution-authorization/v1',
        requestId: request.id,
        requestHash: request.requestHash,
        targetProjectId: request.targetProjectId,
        assessmentId: request.assessmentId,
        qualityPlanId: request.qualityPlanId,
        qualityPlanRevisionId: request.qualityPlanRevisionId,
        subjectRevisionId: request.evaluationSubjectRevisionId,
        environmentId: request.environmentId,
        publicationFingerprint: request.publicationFingerprint,
        runtimeInputHash: request.runtimeInputHash,
        credentialBindings: [{ slot: scope.bindings[0]!.slot, ref: scope.bindings[0]!.reference }],
      },
    })
    const assertion = `${header}.${payload}.${sign(null, Buffer.from(`${header}.${payload}`), privateKey).toString('base64url')}`
    try {
      const response = await issueHostAssertionGrant(assertion)
      expect(response).toMatchObject({ grantId: 'grant-1', requestId: 'request-1' })
      expect(JSON.stringify(response)).not.toContain(assertion)
      expect(JSON.stringify(response)).not.toContain('secret')
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })

  it('rejects non-canonical base64url and duplicate JSON members before JWS verification', async () => {
    const payload = base64({
      iss: 'host',
      sub: 'subject',
      aud: 'audience',
      iat: 1,
      nbf: 1,
      exp: 2,
      jti: 'jti',
      authorization: {},
    })
    const duplicateHeader = Buffer.from(
      '{"alg":"EdDSA","alg":"EdDSA","kid":"key","typ":"appraise-credential-execution+jwt"}',
    ).toString('base64url')
    await expect(issueHostAssertionGrant(`${duplicateHeader}.${payload}.signature`)).rejects.toThrow(
      'HOST_ASSERTION_INVALID',
    )
    await expect(
      issueHostAssertionGrant(
        `${base64({ alg: 'EdDSA', kid: 'key', typ: 'appraise-credential-execution+jwt' })}=.${payload}.signature`,
      ),
    ).rejects.toThrow('HOST_ASSERTION_INVALID')
    await expect(
      issueHostAssertionGrant(
        `${base64({ alg: 'EdDSA', kid: 'key', typ: 'appraise-credential-execution+jwt' })}.${payload}.${'A'.repeat(86)}=`,
      ),
    ).rejects.toThrow('HOST_ASSERTION_INVALID')
  })

  it('fails unavailable for a duplicate host trust key identity', async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'appraise-host-trust-'))
    const { publicKey } = generateKeyPairSync('ed25519')
    const current = Math.floor(Date.now() / 1_000)
    const key = {
      issuer: 'host',
      kid: 'key',
      publicKeyJwk: publicKey.export({ format: 'jwk' }),
      validFrom: new Date((current - 60) * 1_000).toISOString(),
      signingEndsAt: new Date((current + 60) * 1_000).toISOString(),
      verificationEndsAt: new Date((current + 60) * 1_000).toISOString(),
    }
    await writeFile(
      path.join(temp, 'trust.json'),
      JSON.stringify({ version: 1, audience: 'audience', keys: [key, key] }),
    )
    process.env.APPRAISE_HOST_ASSERTION_TRUST_FILE = path.join(temp, 'trust.json')
    const header = base64({ alg: 'EdDSA', kid: 'key', typ: 'appraise-credential-execution+jwt' })
    const payload = base64({
      iss: 'host',
      sub: 'subject',
      aud: 'audience',
      iat: current,
      nbf: current,
      exp: current + 1,
      jti: 'jti',
      authorization: {},
    })
    try {
      await expect(issueHostAssertionGrant(`${header}.${payload}.${'A'.repeat(86)}`)).rejects.toThrow(
        'HOST_ASSERTION_UNAVAILABLE',
      )
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })

  it('fails unavailable for non-canonical or non-Ed25519-length trust JWK x material', async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'appraise-host-trust-'))
    const current = Math.floor(Date.now() / 1_000)
    await writeFile(
      path.join(temp, 'trust.json'),
      JSON.stringify({
        version: 1,
        audience: 'audience',
        keys: [
          {
            issuer: 'host',
            kid: 'key',
            publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'AA' },
            validFrom: new Date((current - 60) * 1_000).toISOString(),
            signingEndsAt: new Date((current + 60) * 1_000).toISOString(),
            verificationEndsAt: new Date((current + 60) * 1_000).toISOString(),
          },
        ],
      }),
    )
    process.env.APPRAISE_HOST_ASSERTION_TRUST_FILE = path.join(temp, 'trust.json')
    const header = base64({ alg: 'EdDSA', kid: 'key', typ: 'appraise-credential-execution+jwt' })
    const payload = base64({
      iss: 'host',
      sub: 'subject',
      aud: 'audience',
      iat: current,
      nbf: current,
      exp: current + 1,
      jti: 'jti',
      authorization: {},
    })
    try {
      await expect(issueHostAssertionGrant(`${header}.${payload}.${'A'.repeat(86)}`)).rejects.toThrow(
        'HOST_ASSERTION_UNAVAILABLE',
      )
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })
})
