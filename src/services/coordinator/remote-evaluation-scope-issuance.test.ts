import * as fs from 'node:fs/promises'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const hash = (letter: string) => `sha256:${letter.repeat(64)}`

const { database, state } = vi.hoisted(() => {
  const state = {
    subjects: [] as Array<{
      id: string
      subjectDigest: string
      subjectKind: string
      authority: string
      metadataJson?: string | null
    }>,
    bindings: [] as Array<Record<string, unknown>>,
    issuances: [] as Array<{
      id: string
      targetProjectId: string
      idempotencyKey: string
      requestHash: string
      evaluationSubjectRevisionId: string
    }>,
    environment: {
      id: 'environment-sauce',
      targetProjectId: 'target-sauce',
      name: 'Sauce Demo',
      baseUrl: 'https://www.saucedemo.com/',
      expectedPageTitle: 'Swag Labs',
      apiBaseUrl: null as string | null,
      username: null as string | null,
      credentialState: 'NONE',
      passwordEnvironmentVariable: null as string | null,
      scopeVersion: 1,
      updatedAt: new Date('2026-08-22T00:00:00.000Z'),
    },
  }
  const target = {
    id: 'target-sauce',
    kind: 'REMOTE_BLACK_BOX',
    fingerprint: `sha256:${'a'.repeat(64)}`,
    canonicalIdentity: 'remote:https://www.saucedemo.com',
    normalizedRemoteOrigin: 'https://www.saucedemo.com',
  }
  const database = {
    targetProject: {
      findFirst: vi.fn(async ({ where }) =>
        where.OR.some(
          (candidate: Record<string, string>) =>
            Object.values(candidate).includes(target.id) ||
            Object.values(candidate).includes(target.fingerprint) ||
            Object.values(candidate).includes(target.canonicalIdentity),
        )
          ? target
          : null,
      ),
    },
    environment: {
      findFirst: vi.fn(async () => ({ ...state.environment })),
    },
    qualityPlanRevision: { findFirst: vi.fn(async () => ({ contentHash: hash('b') })) },
    evaluationSubjectRevision: {
      findFirst: vi.fn(async ({ where, include }) => {
        const subject = state.subjects.find(subject =>
          where.id ? subject.id === where.id : subject.subjectDigest === where.subjectDigest,
        )
        if (!subject) return null
        return include?.remoteEvaluationScopeBinding
          ? {
              ...subject,
              remoteEvaluationScopeBinding:
                state.bindings.find(binding => binding.evaluationSubjectRevisionId === subject.id) ?? null,
            }
          : subject
      }),
      create: vi.fn(async ({ data }) => {
        if (state.subjects.some(subject => subject.subjectDigest === data.subjectDigest))
          throw Object.assign(new Error('unique'), { code: 'P2002' })
        const subject = { id: `subject-${state.subjects.length + 1}`, ...data }
        state.subjects.push(subject)
        return subject
      }),
    },
    remoteEvaluationScopeBinding: {
      findFirst: vi.fn(
        async ({ where }) =>
          state.bindings.find(binding =>
            where.scopeHash
              ? binding.targetProjectId === where.targetProjectId && binding.scopeHash === where.scopeHash
              : binding.evaluationSubjectRevisionId === where.evaluationSubjectRevisionId,
          ) ?? null,
      ),
      create: vi.fn(async ({ data }) => {
        if (
          state.bindings.some(
            binding => binding.targetProjectId === data.targetProjectId && binding.scopeHash === data.scopeHash,
          )
        )
          throw Object.assign(new Error('unique'), { code: 'P2002' })
        const binding = { id: `binding-${state.bindings.length + 1}`, ...data }
        state.bindings.push(binding)
        return binding
      }),
    },
    remoteEvaluationScopeIssuance: {
      findFirst: vi.fn(
        async ({ where }) =>
          state.issuances.find(
            issuance =>
              issuance.targetProjectId === where.targetProjectId && issuance.idempotencyKey === where.idempotencyKey,
          ) ?? null,
      ),
      create: vi.fn(async ({ data }) => {
        if (
          state.issuances.some(
            issuance =>
              issuance.targetProjectId === data.targetProjectId && issuance.idempotencyKey === data.idempotencyKey,
          )
        ) {
          const error = Object.assign(new Error('unique'), { code: 'P2002' })
          throw error
        }
        state.issuances.push({ id: `issuance-${state.issuances.length + 1}`, ...data })
      }),
    },
    $transaction: vi.fn(async callback => callback(database)),
  }
  return { database, state }
})

vi.mock('@/config/db-config', () => ({ default: database }))
vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }))
import {
  assertRemoteEvaluationScopePreflight,
  assertRemoteEvaluationScopeCurrent,
  createRemoteEvaluationScope,
  hydrateRemoteEvaluationScopeBindings,
  readRemoteEvaluationScope,
  remoteScopePhaseBinding,
  setRemoteEvaluationScopePreflightResolverForTests,
} from './remote-evaluation-scope-service'

function request(idempotencyKey: string) {
  return {
    target: 'target-sauce',
    qualityPlanId: 'plan-1',
    revisionId: 'revision-1',
    expectedDesignHash: hash('e'),
    validationBindings: [
      {
        validationId: 'validation-1',
        locatorIds: [],
        steps: [{ stepId: 'browser.ready', version: '1', inputs: {}, description: 'the remote fixture is ready' }],
      },
    ],
    environment: { environmentId: 'environment-sauce' },
    runtime: { browserEngine: 'CHROMIUM' as const },
    idempotencyKey,
  }
}

function validationIdentity(realizationHash: string) {
  return {
    validationVersionId: 'validation-1',
    validationIdentity: 'login-entry',
    version: 1,
    canonicalHash: hash('e'),
    canonicalAstHash: hash('f'),
    realizationHash,
  }
}

describe('remote evaluation scope issuance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.subjects.splice(0)
    state.bindings.splice(0)
    state.issuances.splice(0)
    Object.assign(state.environment, {
      baseUrl: 'https://www.saucedemo.com/',
      expectedPageTitle: 'Swag Labs',
      updatedAt: new Date('2026-08-22T00:00:00.000Z'),
    })
    setRemoteEvaluationScopePreflightResolverForTests(async () => ({
      realizationPreflightHash: hash('c'),
      validations: [validationIdentity(hash('d'))],
    }))
  })

  it('is DB-only: it performs no filesystem, process, or network I/O while issuing a scope', async () => {
    const readFile = vi.mocked(fs.readFile)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(createRemoteEvaluationScope(request('scope-1'))).resolves.toMatchObject({
      subject: { subjectKind: 'REMOTE_EVALUATION_SCOPE', targetContentIdentity: 'not_asserted' },
      scope: {
        environmentId: 'environment-sauce',
        algorithmVersion: 'appraise.quality-assessment-preflight/v2',
        scopeIntentHash: expect.stringMatching(/^sha256:/),
        realizationIntentHash: expect.stringMatching(/^sha256:/),
        preflightHash: hash('c'),
        expectedPreflight: {
          algorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightHash: hash('c'),
        },
      },
      replayed: false,
    })
    expect(readFile).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('provides exact replay, rejects changed input for the same key, and gives a new receipt for an identical scope', async () => {
    const first = await createRemoteEvaluationScope(request('scope-1'))
    const replay = await createRemoteEvaluationScope(request('scope-1'))
    const secondReceipt = await createRemoteEvaluationScope(request('scope-2'))
    expect(replay).toMatchObject({ replayed: true, subject: { id: first.subject.id } })
    expect(secondReceipt).toMatchObject({ replayed: false, subject: { id: first.subject.id } })
    expect(state.issuances).toHaveLength(2)
    await expect(
      createRemoteEvaluationScope({ ...request('scope-1'), expectedDesignHash: hash('9') }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('hydrates omitted bindings from the sealed scope and rejects a supplied semantic mismatch before any write', async () => {
    const issued = await createRemoteEvaluationScope(request('scope-hydrate-bindings'))
    const persisted = JSON.parse(String(state.bindings[0]!.validationBindingsJson)) as Array<Record<string, unknown>>
    const scope = {
      subject: { subjectRevisionId: issued.subject.id, expectedSubjectDigest: issued.subject.subjectDigest },
      targetProjectId: 'target-sauce',
      qualityPlanId: 'plan-1',
      revisionId: 'revision-1',
      environmentId: 'environment-sauce',
    }
    const omitted = await hydrateRemoteEvaluationScopeBindings(scope)
    const explicit = await hydrateRemoteEvaluationScopeBindings({ ...scope, validationBindings: persisted })
    expect(explicit.validationBindings).toEqual(omitted.validationBindings)
    expect(omitted).toMatchObject({
      bindingsSource: 'persisted_remote_scope',
      bindingsRecovered: true,
      counts: { validationCount: 1, stepCount: 1, locatorCount: 0 },
    })
    expect(explicit).toMatchObject({ bindingsSource: 'caller_exact_remote_scope', bindingsRecovered: false })

    const altered = JSON.parse(JSON.stringify(persisted)) as Array<{
      steps: Array<{ inputs: Record<string, unknown> }>
    }>
    altered[0]!.steps[0]!.inputs = { value: 'changed' }
    const writes = {
      subjects: state.subjects.length,
      bindings: state.bindings.length,
      issuances: state.issuances.length,
    }
    await expect(hydrateRemoteEvaluationScopeBindings({ ...scope, validationBindings: altered })).rejects.toMatchObject(
      { code: 'CONFLICT', details: { code: 'remote_evaluation_scope_binding_mismatch' } },
    )
    expect(state.subjects).toHaveLength(writes.subjects)
    expect(state.bindings).toHaveLength(writes.bindings)
    expect(state.issuances).toHaveLength(writes.issuances)
  })

  it('rejects every compact binding identity change, including execution-step order', async () => {
    const issued = await createRemoteEvaluationScope(request('scope-hydrate-identity'))
    const persisted = JSON.parse(String(state.bindings[0]!.validationBindingsJson)) as Array<{
      validationId: string
      locatorIds: string[]
      steps: Array<{
        stepId: string
        version: string
        inputs: Record<string, unknown>
        keyword: string
        description: string
      }>
    }>
    const scope = {
      subject: { subjectRevisionId: issued.subject.id },
      targetProjectId: 'target-sauce',
      qualityPlanId: 'plan-1',
      revisionId: 'revision-1',
      environmentId: 'environment-sauce',
    }
    const mutate = (change: (packet: typeof persisted) => void) => {
      const packet = JSON.parse(JSON.stringify(persisted)) as typeof persisted
      change(packet)
      return packet
    }
    const changedPackets = [
      mutate(packet => (packet[0]!.validationId = 'validation-changed')),
      mutate(packet => (packet[0]!.steps[0]!.stepId = 'browser.changed')),
      mutate(packet => (packet[0]!.steps[0]!.inputs = { value: 'changed' })),
      mutate(packet => (packet[0]!.locatorIds = ['locator-changed'])),
      mutate(packet => (packet[0]!.steps[0]!.description = 'changed description')),
    ]
    for (const validationBindings of changedPackets)
      await expect(hydrateRemoteEvaluationScopeBindings({ ...scope, validationBindings })).rejects.toMatchObject({
        code: 'CONFLICT',
        details: { code: 'remote_evaluation_scope_binding_mismatch' },
      })

    const orderedRequest = request('scope-hydrate-step-order')
    orderedRequest.validationBindings[0]!.steps.push({
      stepId: 'browser.ready.second',
      version: '1',
      inputs: {},
      description: 'the remote fixture still is ready',
    })
    const ordered = await createRemoteEvaluationScope(orderedRequest)
    const orderedPersisted = JSON.parse(String(state.bindings[1]!.validationBindingsJson)) as typeof persisted
    const reversed = JSON.parse(JSON.stringify(orderedPersisted)) as typeof persisted
    reversed[0]!.steps.reverse()
    await expect(
      hydrateRemoteEvaluationScopeBindings({
        ...scope,
        subject: { subjectRevisionId: ordered.subject.id },
        validationBindings: reversed,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { code: 'remote_evaluation_scope_binding_mismatch' } })
  })

  it('returns an idempotency conflict instead of projecting a newly resolved scope after environment drift', async () => {
    await createRemoteEvaluationScope(request('scope-1'))
    state.environment.baseUrl = 'https://www.saucedemo.com/'
    state.environment.expectedPageTitle = 'Changed title'
    state.environment.updatedAt = new Date('2026-08-22T00:01:00.000Z')
    await expect(createRemoteEvaluationScope(request('scope-1'))).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('returns an idempotency conflict instead of projecting a newly resolved scope after realization drift', async () => {
    await createRemoteEvaluationScope(request('scope-1'))
    setRemoteEvaluationScopePreflightResolverForTests(async () => ({
      realizationPreflightHash: hash('9'),
      validations: [validationIdentity(hash('9'))],
    }))
    await expect(createRemoteEvaluationScope(request('scope-1'))).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it.each([null, JSON.stringify({ schemaVersion: 'appraise.remote-evaluation-scope/v1', scopeHash: 'wrong' })])(
    'rejects a same-digest subject with %p metadata before creating a binding or issuance',
    async metadataJson => {
      await createRemoteEvaluationScope(request('scope-subject-baseline'))
      const subject = state.subjects[0]!
      // Model the damaged initial-reuse shape directly: same canonical digest
      // remains, but there is no binding yet and therefore no binding packet
      // to save us from accepting bad subject metadata.
      state.bindings.splice(0)
      subject.metadataJson = metadataJson
      const bindingsBefore = state.bindings.length
      const issuancesBefore = state.issuances.length

      await expect(createRemoteEvaluationScope(request('scope-subject-metadata'))).rejects.toMatchObject({
        code: 'CONFLICT',
        details: { code: 'remote_evaluation_scope_stale' },
      })
      expect(state.bindings).toHaveLength(bindingsBefore)
      expect(state.issuances).toHaveLength(issuancesBefore)
    },
  )

  it('performs the environment CAS inside issuance before any subject, binding, or receipt write', async () => {
    database.$transaction.mockImplementationOnce(async callback => {
      state.environment.expectedPageTitle = 'Changed inside issuance transaction'
      state.environment.updatedAt = new Date('2026-08-22T00:01:00.000Z')
      return callback(database)
    })
    await expect(createRemoteEvaluationScope(request('scope-transaction-drift'))).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { code: 'remote_evaluation_scope_stale' },
    })
    expect(state.subjects).toEqual([])
    expect(state.bindings).toEqual([])
    expect(state.issuances).toEqual([])
  })

  it('recomputes canonical validation realization through the transaction client before scope issuance writes', async () => {
    setRemoteEvaluationScopePreflightResolverForTests(async (_input, client) => ({
      realizationPreflightHash: (client as unknown) === database ? hash('c') : hash('9'),
      validations: [validationIdentity((client as unknown) === database ? hash('d') : hash('9'))],
    }))
    database.$transaction.mockImplementationOnce(async callback => callback({ ...database }))
    await expect(createRemoteEvaluationScope(request('scope-realization-transaction-drift'))).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { code: 'remote_evaluation_scope_stale' },
    })
    expect(state.subjects).toEqual([])
    expect(state.bindings).toEqual([])
    expect(state.issuances).toEqual([])
  })

  it('uses the actual full checker against a transaction-local resolver and rejects a changed Step Definition or locator realization before a phase write', async () => {
    const created = await createRemoteEvaluationScope(request('scope-full-check'))
    const subject = state.subjects.find(item => item.id === created.subject.id)!
    const binding = state.bindings.find(item => item.evaluationSubjectRevisionId === subject.id)!
    const phase = remoteScopePhaseBinding({ subject, binding: binding as never })
    await expect(assertRemoteEvaluationScopeCurrent(phase, database as never)).resolves.toMatchObject({
      binding: expect.objectContaining({ scopeHash: phase.scopeHash }),
    })

    // The scope resolver is the same read-model path compilation/publication
    // use in their durable transactions. Changing either compact realization
    // constituent after the outer check must therefore reject the transaction
    // before it can project, publish, checkpoint, or mark status.
    setRemoteEvaluationScopePreflightResolverForTests(async () => ({
      realizationPreflightHash: hash('9'),
      validations: [validationIdentity(hash('9'))],
    }))
    await expect(assertRemoteEvaluationScopeCurrent(phase, database as never)).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { code: 'remote_evaluation_scope_stale' },
    })
  })

  it('reports bounded request, recomputed, and algorithm preflight mismatches without realization details', async () => {
    const issued = await createRemoteEvaluationScope(request('scope-preflight-diagnostics'))
    const input = {
      ...request('scope-preflight-diagnostics'),
      subject: { subjectRevisionId: issued.subject.id },
      preflight: {
        algorithmVersion: issued.scope.algorithmVersion,
        preflightHash: issued.scope.preflightHash,
      },
    }
    await expect(assertRemoteEvaluationScopePreflight(input)).resolves.toMatchObject({
      subject: { id: issued.subject.id },
    })

    await expect(
      assertRemoteEvaluationScopePreflight({
        ...input,
        preflight: { ...input.preflight, algorithmVersion: 'appraise.quality-assessment-preflight/v1' },
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: {
        code: 'publication_preflight_mismatch',
        mismatch: ['algorithmVersion'],
        expectedPreflight: {
          algorithmVersion: issued.scope.algorithmVersion,
          preflightHash: issued.scope.preflightHash,
        },
        observedPreflight: {
          algorithmVersion: 'appraise.quality-assessment-preflight/v1',
          preflightHash: issued.scope.preflightHash,
        },
      },
    })

    await expect(
      assertRemoteEvaluationScopePreflight({
        ...input,
        preflight: { ...input.preflight, preflightHash: hash('9') },
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { code: 'publication_preflight_mismatch', mismatch: ['request'] },
    })

    setRemoteEvaluationScopePreflightResolverForTests(async () => ({
      scopeIntentHash: issued.scope.scopeIntentHash,
      realizationIntentHash: hash('9'),
      preflightHash: hash('9'),
      validations: [validationIdentity(hash('9'))],
    }))
    await expect(assertRemoteEvaluationScopePreflight(input)).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { code: 'publication_preflight_mismatch', mismatch: ['recomputed'] },
    })
  })

  it('concurrently converges on one immutable subject and target-scoped receipts', async () => {
    const [first, second] = await Promise.all([
      createRemoteEvaluationScope(request('scope-1')),
      createRemoteEvaluationScope(request('scope-2')),
    ])
    expect(first.subject.id).toBe(second.subject.id)
    expect(state.subjects).toHaveLength(1)
    expect(state.bindings).toHaveLength(1)
    expect(state.issuances).toHaveLength(2)
  })

  it('strictly rejects unrecognized URL aliases and additional descriptor fields', async () => {
    await expect(
      createRemoteEvaluationScope({ ...request('scope-1'), target: 'https://www.saucedemo.com' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(
      createRemoteEvaluationScope({ ...request('scope-1'), url: 'https://www.saucedemo.com' }),
    ).rejects.toThrow()
  })

  it('recovers the exact persisted v2 compact packet without target I/O or any issuance writes', async () => {
    const issued = await createRemoteEvaluationScope({
      ...request('scope-recovery-order'),
      validationBindings: [
        {
          validationId: 'validation-z',
          locatorIds: ['locator-z'],
          steps: [
            {
              // Persisted Step references from the live validation packet can
              // already carry their version suffix. Recovery must judge the
              // compact input shape, not this harmless identifier or text.
              stepId: 'browser.forms.fill.configured.credential@1',
              version: '1',
              inputs: { target: 'locator-password' },
              description: 'the configured credential fills the password field',
            },
          ],
        },
        {
          validationId: 'validation-a',
          locatorIds: ['locator-a'],
          steps: [
            {
              stepId: 'browser.live-shaped.inputs',
              version: '1',
              inputs: {
                value: 'Sauce Labs Backpack',
                route: '/inventory.html',
                text: 'Products',
                elementName: 'shopping cart',
                expected: true,
                label: 'Add to cart',
                target: 'locator-inventory-item',
                expectedTexts: ['Sauce Labs Backpack', '$29.99'],
              },
              description: 'the live inventory and cart packet uses harmless scalar inputs',
            },
            { stepId: 'browser.ready', version: '1', inputs: {}, description: 'the page is ready' },
          ],
        },
      ],
    })
    const writes = {
      subjects: state.subjects.length,
      bindings: state.bindings.length,
      issuances: state.issuances.length,
    }
    const readFile = vi.mocked(fs.readFile)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const recovered = await readRemoteEvaluationScope({
      target: 'target-sauce',
      qualityPlanId: 'plan-1',
      revisionId: 'revision-1',
      subjectRevisionId: issued.subject.id,
      expectedSubjectDigest: issued.subject.subjectDigest,
      expectedScopeHash: issued.scope.scopeHash,
      expectedPreflightHash: issued.scope.preflightHash,
      responseMode: 'full',
    })

    expect(recovered).toMatchObject({
      subject: { subjectRevisionId: issued.subject.id, subjectDigest: issued.subject.subjectDigest },
      environment: { environmentId: 'environment-sauce' },
      runtime: { browserEngine: 'CHROMIUM' },
      expectedDesignHash: hash('e'),
      scope: { expectedPreflight: issued.scope.expectedPreflight },
      counts: { validationCount: 2, stepCount: 3, locatorCount: 2 },
    })
    expect(
      (recovered as { validationBindings: Array<{ validationId: string; steps: unknown[] }> }).validationBindings,
    ).toEqual([
      expect.objectContaining({
        validationId: 'validation-a',
        steps: expect.arrayContaining([
          expect.objectContaining({
            inputs: {
              value: 'Sauce Labs Backpack',
              route: '/inventory.html',
              text: 'Products',
              elementName: 'shopping cart',
              expected: true,
              label: 'Add to cart',
              target: 'locator-inventory-item',
              expectedTexts: ['Sauce Labs Backpack', '$29.99'],
            },
          }),
        ]),
      }),
      expect.objectContaining({
        validationId: 'validation-z',
        steps: [expect.objectContaining({ inputs: { target: 'locator-password' } })],
      }),
    ])
    expect(state.subjects).toHaveLength(writes.subjects)
    expect(state.bindings).toHaveLength(writes.bindings)
    expect(state.issuances).toHaveLength(writes.issuances)
    expect(readFile).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(JSON.stringify(recovered)).not.toContain('environmentSnapshotJson')
    expect(JSON.stringify(recovered)).not.toContain('canonicalScopeJson')
  })

  it.each([
    ['password value', { password: 'not-a-portable-secret' }],
    ['credential reference', { credentialRef: 'environment:password' }],
    ['token value', { token: 'not-a-portable-token' }],
    ['authorization value', { authorization: 'Bearer not-portable' }],
    ['credential-bearing URL', { route: 'https://user:password@example.test/login' }],
    ['suspicious nested locator payload', { target: { id: 'locator-password', token: 'not-portable' } }],
  ])(
    'returns a compact summary but fails closed before returning an exact packet with a %s',
    async (_label, inputs) => {
      const issued = await createRemoteEvaluationScope(request('scope-recovery-secret'))
      const binding = state.bindings[0]!
      binding.validationBindingsJson = JSON.stringify([
        {
          validationId: 'validation-1',
          locatorIds: [],
          steps: [
            {
              stepId: 'browser.forms.fill.text',
              version: '1',
              inputs,
              keyword: 'Given',
              description: 'an unsafe historical binding',
            },
          ],
        },
      ])
      const summary = await readRemoteEvaluationScope({
        target: 'target-sauce',
        qualityPlanId: 'plan-1',
        revisionId: 'revision-1',
        subjectRevisionId: issued.subject.id,
      })
      expect(summary).not.toHaveProperty('validationBindings')
      await expect(
        readRemoteEvaluationScope({
          target: 'target-sauce',
          qualityPlanId: 'plan-1',
          revisionId: 'revision-1',
          subjectRevisionId: issued.subject.id,
          responseMode: 'full',
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        details: { code: 'remote_evaluation_scope_recovery_secret_input' },
      })
    },
  )

  it('rejects an expected recovery hash or altered v2 subject metadata without enumerating persisted scope values', async () => {
    const issued = await createRemoteEvaluationScope(request('scope-recovery-mismatch'))
    await expect(
      readRemoteEvaluationScope({
        target: 'target-sauce',
        qualityPlanId: 'plan-1',
        revisionId: 'revision-1',
        subjectRevisionId: issued.subject.id,
        expectedPreflightHash: hash('9'),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { code: 'remote_evaluation_scope_read_mismatch' } })

    state.subjects[0]!.metadataJson = JSON.stringify({ schemaVersion: 'appraise.remote-evaluation-scope/v2' })
    await expect(
      readRemoteEvaluationScope({
        target: 'target-sauce',
        qualityPlanId: 'plan-1',
        revisionId: 'revision-1',
        subjectRevisionId: issued.subject.id,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { code: 'remote_evaluation_scope_stale' } })
  })
})
