import { describe, expect, it } from 'vitest'

import {
  applyAuthoringResponseMode,
  applyLifecycleResponseMode,
  projectRemoteScopePartitionCreateResponse,
  projectRemoteScopeReadResponse,
} from './response-projector.js'
import { assessmentPreflightInputSchema, assessmentPrepareInputSchema } from './domains/quality-design.js'

const hash = (letter: string) => `sha256:${letter.repeat(64)}`

describe('lifecycle response projection', () => {
  it.each([
    ['initial successor', false],
    ['exact idempotency replay', true],
  ])('keeps the immutable requirement-query successor handoff for %s', (_label, idempotent) => {
    const projected = applyAuthoringResponseMode(
      {
        idempotent,
        predecessorRevisionId: 'revision-predecessor-1',
        qualityPlan: { id: 'plan-1', title: 'Not needed for the next call' },
        revision: {
          id: 'revision-successor-2',
          revision: 2,
          status: 'DRAFT',
          contentHash: hash('a'),
          sourceSpecification: { sensitive: 'unrelated source payload' },
          requirementGraph: { nodes: ['unrelated requirement graph'] },
          methodology: { methodologyId: 'appraise.built-in/quality-os-core' },
        },
        requirements: [{ id: 'requirement-1', text: 'not needed for successor handoff' }],
        queries: [{ id: 'query-1', answer: 'not needed for successor handoff' }],
        validationVersions: [{ id: 'validation-1' }],
      },
      'summary',
    ) as Record<string, unknown>

    expect(projected).toMatchObject({
      idempotent,
      predecessorRevisionId: 'revision-predecessor-1',
      revision: {
        id: 'revision-successor-2',
        revision: 2,
        status: 'DRAFT',
        contentHash: hash('a'),
      },
    })
    expect(projected.revision).toEqual({
      id: 'revision-successor-2',
      revision: 2,
      status: 'DRAFT',
      contentHash: hash('a'),
    })
    expect(projected).not.toHaveProperty('qualityPlan')
    expect(projected).not.toHaveProperty('requirements')
    expect(projected).not.toHaveProperty('queries')
    expect(projected).not.toHaveProperty('validationVersions')
    expect(JSON.stringify(projected)).not.toContain('unrelated source payload')
    expect(JSON.stringify(projected)).not.toContain('unrelated requirement graph')
  })

  it('labels a malformed committed partition receipt with its own recovery operation', () => {
    try {
      projectRemoteScopePartitionCreateResponse({ manifest: {} }, 'summary')
      throw new Error('Expected malformed partition receipt rejection')
    } catch (error) {
      expect(error).toMatchObject({
        envelope: {
          operation: { name: 'evaluation_subject_remote_scope_partition_create' },
          retry: { nextAction: { tool: 'evaluation_subject_remote_scope_partition_create' } },
        },
      })
    }
  })
  it('permits a v2 remote subject to omit bulk bindings from preflight and preparation schemas', () => {
    const remote = {
      target: 'target-1',
      qualityPlanId: 'plan-1',
      revisionId: 'revision-1',
      expectedDesignHash: hash('a'),
      environment: { environmentId: 'environment-1' },
      subject: { subjectRevisionId: 'subject-remote-1' },
    }
    expect(assessmentPreflightInputSchema.parse(remote)).not.toHaveProperty('validationBindings')
    expect(
      assessmentPrepareInputSchema.parse({
        ...remote,
        expectedPreflight: { algorithmVersion: 'appraise.quality-assessment-preflight/v2', preflightHash: hash('b') },
        idempotencyKey: 'prepare-remote-1',
      }),
    ).not.toHaveProperty('validationBindings')
  })

  it('returns only the preparation-ready exact remote scope fields in full recovery mode', () => {
    const recovered = {
      subject: {
        subjectRevisionId: 'subject-remote-1',
        subjectDigest: hash('a'),
        subjectKind: 'REMOTE_EVALUATION_SCOPE',
        authority: 'appraisejs:remote-evaluation-scope:v2',
      },
      targetProjectId: 'target-1',
      qualityPlanId: 'plan-1',
      revisionId: 'revision-1',
      expectedDesignHash: hash('b'),
      environment: { environmentId: 'environment-1' },
      runtime: { browserEngine: 'CHROMIUM' },
      scope: {
        scopeHash: hash('c'),
        algorithmVersion: 'appraise.quality-assessment-preflight/v2',
        scopeIntentHash: hash('d'),
        realizationIntentHash: hash('e'),
        preflightHash: hash('f'),
        expectedPreflight: { algorithmVersion: 'appraise.quality-assessment-preflight/v2', preflightHash: hash('f') },
        validationBindingsHash: hash('0'),
        environmentId: 'environment-1',
      },
      counts: { validationCount: 1, stepCount: 2, locatorCount: 1 },
      nextRecommendedAction: 'assessment_preflight',
      validationBindings: [
        {
          validationId: 'validation-1',
          locatorIds: ['locator-1'],
          steps: [
            { stepId: 'browser.ready', version: '1', inputs: {}, keyword: 'Given', description: 'the page is ready' },
            {
              stepId: 'browser.forms.fill.configured.credential',
              version: '1',
              inputs: { target: 'locator-password' },
              keyword: 'When',
              description: 'the configured credential is used',
            },
          ],
        },
      ],
      environmentSnapshotJson: '{"password":"not-public"}',
      canonicalScopeJson: '{"internal":true}',
      policy: { secret: 'not-public' },
    }
    const summary = projectRemoteScopeReadResponse(recovered, 'summary') as Record<string, unknown>
    const full = projectRemoteScopeReadResponse(recovered, 'full') as Record<string, unknown>
    expect(summary).not.toHaveProperty('validationBindings')
    expect(full.validationBindings).toEqual(recovered.validationBindings)
    expect(full).not.toHaveProperty('environmentSnapshotJson')
    expect(full).not.toHaveProperty('canonicalScopeJson')
    expect(JSON.stringify(full)).not.toContain('not-public')
  })

  it('rejects a malformed full recovery response instead of returning a partial packet', () => {
    expect(() =>
      projectRemoteScopeReadResponse(
        {
          subject: { subjectRevisionId: 'subject-1' },
          validationBindings: [{ steps: [{ inputs: { password: 'secret' } }] }],
        },
        'full',
      ),
    ).toThrow(/invalid remote scope recovery packet/)
  })

  it('keeps preparation identities and hashes at the top level of the compact summary', () => {
    expect(
      applyLifecycleResponseMode(
        {
          preparationId: 'prepare-1',
          phase: 'STARTED',
          environment: { id: 'environment-1' },
          publication: { validationVersionIds: ['validation-1'], compilationHash: 'sha256:publication' },
          assessment: { id: 'assessment-1' },
          assessmentRun: { id: 'run-1' },
          hashes: { inputHash: 'sha256:input', compilationHash: 'sha256:compilation' },
          nextRecommendedAction: 'assessment_reconcile',
          nextRequiredAgentBehavior: 'wait_for_terminal_execution_then_reconcile',
          internalOnly: 'not included',
        },
        'summary',
      ),
    ).toEqual({
      status: undefined,
      qualityPlanId: undefined,
      revisionId: undefined,
      revision: undefined,
      predecessorRevisionId: undefined,
      idempotent: undefined,
      preparationId: 'prepare-1',
      phase: 'STARTED',
      environment: { id: 'environment-1' },
      publication: { validationVersionIds: ['validation-1'], compilationHash: 'sha256:publication' },
      assessment: { id: 'assessment-1' },
      assessmentRun: { id: 'run-1' },
      hashes: { inputHash: 'sha256:input', compilationHash: 'sha256:compilation' },
      assessmentId: undefined,
      assessmentRunId: undefined,
      validationVersionId: undefined,
      evidenceSetHash: undefined,
      algorithmVersion: undefined,
      scopeIntentHash: undefined,
      realizationIntentHash: undefined,
      preflightHash: undefined,
      validationCount: undefined,
      stepReferenceCount: undefined,
      locatorReferenceCount: undefined,
      stepReferenceHash: undefined,
      locatorReferenceHash: undefined,
      validations: undefined,
      diagnostics: undefined,
      subject: undefined,
      scope: undefined,
      replayed: undefined,
      nextRecommendedAction: 'assessment_reconcile',
      nextRequiredAgentBehavior: 'wait_for_terminal_execution_then_reconcile',
      ready: undefined,
      blockers: undefined,
      warnings: undefined,
      links: undefined,
    })
  })

  it.each(['summary', 'full', 'blockersOnly'] as const)(
    'retains only the machine-safe durable authorization handoff in %s mode',
    responseMode => {
      const authorization = {
        executionRequestId: '5a9fb98f-8912-44a9-b843-30fb19dd6129',
        expectedRequestHash: hash('e'),
        expiresAt: '2026-08-24T12:00:00.000Z',
        authorizationRequestCreated: true,
        nextAction: {
          tool: 'assessment_prepare_run',
          reason:
            'The credential authorization request is committed. Issue a grant, then replay the original compact preparation request with this same idempotencyKey.',
        },
      }
      const projected = applyLifecycleResponseMode(
        {
          preparationId: 'prepare-1',
          phase: 'ASSESSMENT',
          durableState: 'authorization_request_committed',
          authorization,
          blockers: [{ classification: 'authorization_required', message: 'AUTHORIZATION_REQUIRED' }],
          retry: { classification: 'authorization_required', safe: true },
          nextRecommendedAction: 'assessment_prepare_run',
          nextRequiredAgentBehavior: 'replay_same_idempotency_key_to_resume',
        },
        responseMode,
      ) as Record<string, unknown>

      expect(projected).toMatchObject({
        durableState: 'authorization_request_committed',
        authorization,
        nextRecommendedAction: 'assessment_prepare_run',
      })
      expect(JSON.stringify(projected)).not.toContain('APPRAISE_ENV_PASSWORD')
    },
  )

  it.each(['summary', 'full', 'blockersOnly'] as const)(
    'retains the machine-safe committed execution-consent handoff in %s mode',
    responseMode => {
      const executionConsent = {
        assessmentId: 'assessment-1',
        consentId: '5a9fb98f-8912-44a9-b843-30fb19dd6129',
        expectedExecutionManifestHash: hash('e'),
        consentRequestCreated: true,
        nextAction: {
          tool: 'execution_consent_decide',
          arguments: {
            assessmentId: 'assessment-1',
            consentId: '5a9fb98f-8912-44a9-b843-30fb19dd6129',
            expectedExecutionManifestHash: hash('e'),
          },
          reason: 'Decide the committed execution-consent request.',
        },
      }
      const projected = applyLifecycleResponseMode(
        {
          durableState: 'execution_consent_request_committed',
          operationOutcome: 'committed',
          executionConsent,
          nextRecommendedAction: 'execution_consent_decide',
          nextRequiredAgentBehavior: 'decide_then_replay_same_preparation_key',
        },
        responseMode,
      ) as Record<string, unknown>

      expect(projected).toMatchObject({
        durableState: 'execution_consent_request_committed',
        operationOutcome: 'committed',
        executionConsent,
        nextRecommendedAction: 'execution_consent_decide',
      })
    },
  )

  it('keeps the v2 preflight identity at the top level of the default MCP response', () => {
    expect(
      applyLifecycleResponseMode(
        {
          ready: true,
          algorithmVersion: 'appraise.quality-assessment-preflight/v2',
          scopeIntentHash: 'sha256:scope-intent',
          realizationIntentHash: 'sha256:realization-intent',
          preflightHash: hash('e'),
          validationCount: 1,
          diagnostics: [],
          internalRealization: { selector: '[data-sensitive]' },
        },
        'summary',
      ),
    ).toMatchObject({
      ready: true,
      algorithmVersion: 'appraise.quality-assessment-preflight/v2',
      scopeIntentHash: 'sha256:scope-intent',
      realizationIntentHash: 'sha256:realization-intent',
      preflightHash: hash('e'),
      validationCount: 1,
      diagnostics: [],
    })
    expect(
      applyLifecycleResponseMode(
        { ready: true, preflightHash: 'sha256:preflight', internalRealization: { selector: 'hidden' } },
        'summary',
      ),
    ).not.toHaveProperty('internalRealization')
  })

  it('never exposes canonical preflight intent or compact binding content, including full mode', () => {
    const input = {
      ready: true,
      algorithmVersion: 'appraise.quality-assessment-preflight/v2',
      scopeIntentHash: 'sha256:scope',
      realizationIntentHash: 'sha256:realization',
      preflightHash: 'sha256:preflight',
      scopeIntent: { locator: '#secret-selector', stepInputs: { password: 'secret' } },
      realizationIntent: [{ validationVersionId: 'validation-1', intentHash: 'sha256:intent' }],
      validationBindings: [{ locatorIds: ['locator-secret'], steps: [{ inputs: { password: 'secret' } }] }],
    }
    const full = applyLifecycleResponseMode(input, 'full') as Record<string, unknown>
    expect(full).not.toHaveProperty('scopeIntent')
    expect(full).not.toHaveProperty('realizationIntent')
    expect(full).not.toHaveProperty('validationBindings')
    expect(JSON.stringify(full)).not.toContain('secret-selector')
  })

  it.each(['summary', 'full'] as const)(
    'preserves the exact service-owned preflight handoff and action in %s mode',
    responseMode => {
      const expectedPreflight = {
        algorithmVersion: 'appraise.quality-assessment-preflight/v2' as const,
        preflightHash: hash('e'),
      }
      const projected = applyLifecycleResponseMode(
        {
          ready: true,
          algorithmVersion: expectedPreflight.algorithmVersion,
          preflightHash: expectedPreflight.preflightHash,
          expectedPreflight,
          nextRecommendedAction: 'assessment_prepare_run',
          scopeIntent: { locator: '#secret-selector' },
          realizationIntent: { inputs: { password: 'secret' } },
          validationBindings: [{ locatorIds: ['locator-secret'] }],
        },
        responseMode,
      ) as Record<string, unknown>

      expect(projected.expectedPreflight).toBe(expectedPreflight)
      expect(projected.nextRecommendedAction).toBe('assessment_prepare_run')
      expect(JSON.stringify(projected)).not.toContain('secret-selector')
      expect(JSON.stringify(projected)).not.toContain('locator-secret')
    },
  )

  it('projects the remote-scope handoff required by assessment_preflight in the default response', () => {
    expect(
      applyLifecycleResponseMode(
        {
          subject: {
            id: 'subject-remote-1',
            subjectDigest: 'sha256:subject',
            subjectKind: 'REMOTE_EVALUATION_SCOPE',
            authority: 'appraisejs:remote-evaluation-scope:v2',
          },
          scope: {
            scopeHash: hash('a'),
            environmentId: 'environment-1',
            validationBindingsHash: hash('b'),
            algorithmVersion: 'appraise.quality-assessment-preflight/v2',
            scopeIntentHash: hash('c'),
            realizationIntentHash: hash('d'),
            preflightHash: hash('e'),
            expectedPreflight: {
              algorithmVersion: 'appraise.quality-assessment-preflight/v2',
              preflightHash: hash('e'),
            },
          },
          replayed: false,
          nextRecommendedAction: 'Use subjectRevisionId with assessment_preflight, then assessment_prepare_run.',
          internalCanonicalScope: { credentials: 'must not project' },
        },
        'summary',
      ),
    ).toMatchObject({
      subject: { id: 'subject-remote-1', subjectKind: 'REMOTE_EVALUATION_SCOPE' },
      subjectRevisionId: 'subject-remote-1',
      scope: {
        environmentId: 'environment-1',
        preflightHash: hash('e'),
      },
      replayed: false,
      nextRecommendedAction: expect.stringContaining('subjectRevisionId'),
    })
  })

  it('passes the default remote subjectRevisionId directly into the preflight schema', () => {
    const projected = applyLifecycleResponseMode(
      { subject: { id: 'subject-remote-1', subjectKind: 'REMOTE_EVALUATION_SCOPE' } },
      'summary',
    ) as { subjectRevisionId: string }
    expect(
      assessmentPreflightInputSchema.parse({
        target: 'target-1',
        qualityPlanId: 'plan-1',
        revisionId: 'revision-1',
        expectedDesignHash: `sha256:${'a'.repeat(64)}`,
        validationBindings: [
          {
            validationId: 'validation-1',
            locatorIds: [],
            steps: [
              {
                stepId: 'browser.ready',
                version: '1',
                inputs: {},
                description: 'the page is ready',
              },
            ],
          },
        ],
        environment: { environmentId: 'environment-1' },
        subject: { subjectRevisionId: projected.subjectRevisionId },
        responseMode: 'summary',
      }).subject,
    ).toEqual({ subjectRevisionId: 'subject-remote-1' })
  })

  it('keeps a complete safe v2 scope receipt in default and full modes and makes its token directly usable', () => {
    const issued = {
      subject: { id: 'subject-remote-1', authority: 'appraisejs:remote-evaluation-scope:v2' },
      scope: {
        scopeHash: hash('a'),
        algorithmVersion: 'appraise.quality-assessment-preflight/v2',
        scopeIntentHash: hash('c'),
        realizationIntentHash: hash('d'),
        preflightHash: hash('e'),
        expectedPreflight: {
          algorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightHash: hash('e'),
        },
        validationBindingsHash: hash('b'),
        environmentId: 'environment-1',
      },
      scopeIntent: { locator: '#secret-selector', password: 'secret' },
      serverOnly: { secret: 'must-not-project' },
    }
    for (const mode of ['summary', 'full'] as const) {
      const projected = applyLifecycleResponseMode(issued, mode) as {
        subjectRevisionId?: string
        scope: Record<string, unknown>
      }
      expect(projected.scope).toEqual({
        scopeHash: hash('a'),
        algorithmVersion: 'appraise.quality-assessment-preflight/v2',
        scopeIntentHash: hash('c'),
        realizationIntentHash: hash('d'),
        preflightHash: hash('e'),
        expectedPreflight: {
          algorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightHash: hash('e'),
        },
        validationBindingsHash: hash('b'),
        environmentId: 'environment-1',
      })
      expect(JSON.stringify(projected)).not.toContain('secret')
      expect(
        assessmentPreflightInputSchema.parse({
          target: 'target-1',
          qualityPlanId: 'plan-1',
          revisionId: 'revision-1',
          expectedDesignHash: `sha256:${'a'.repeat(64)}`,
          validationBindings: [
            {
              validationId: 'validation-1',
              locatorIds: [],
              steps: [{ stepId: 'browser.ready', version: '1', inputs: {}, description: 'the page is ready' }],
            },
          ],
          environment: { environmentId: 'environment-1' },
          subject: { subjectRevisionId: projected.subjectRevisionId },
        }),
      ).toMatchObject({ subject: { subjectRevisionId: 'subject-remote-1' } })
      expect(
        assessmentPrepareInputSchema.parse({
          target: 'target-1',
          qualityPlanId: 'plan-1',
          revisionId: 'revision-1',
          expectedDesignHash: `sha256:${'a'.repeat(64)}`,
          validationBindings: [
            {
              validationId: 'validation-1',
              locatorIds: [],
              steps: [{ stepId: 'browser.ready', version: '1', inputs: {}, description: 'the page is ready' }],
            },
          ],
          environment: { environmentId: 'environment-1' },
          subject: { subjectRevisionId: projected.subjectRevisionId },
          expectedPreflight: projected.scope.expectedPreflight,
          idempotencyKey: 'prepare-1',
        }).expectedPreflight,
      ).toEqual(projected.scope.expectedPreflight)
    }
  })

  it.each([
    ['missing token', {}],
    [
      'conflicting algorithm',
      {
        expectedPreflight: {
          algorithmVersion: 'appraise.quality-assessment-preflight/v1',
          preflightHash: 'sha256:preflight',
        },
      },
    ],
    [
      'conflicting hash',
      {
        expectedPreflight: {
          algorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightHash: hash('f'),
        },
      },
    ],
    [
      'extra token field',
      {
        expectedPreflight: {
          algorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightHash: hash('e'),
          secret: 'do-not-project',
        },
      },
    ],
  ])('rejects an invalid remote scope receipt in summary and full mode: %s', (_label, token) => {
    const issued = {
      subject: { id: 'subject-remote-1' },
      scope: {
        scopeHash: hash('a'),
        algorithmVersion: 'appraise.quality-assessment-preflight/v2',
        scopeIntentHash: hash('c'),
        realizationIntentHash: hash('d'),
        preflightHash: hash('e'),
        validationBindingsHash: hash('b'),
        environmentId: 'environment-1',
        ...token,
      },
      scopeIntent: { password: 'secret' },
    }
    for (const mode of ['summary', 'full'] as const) {
      expect(() => applyLifecycleResponseMode(issued, mode)).toThrow(
        'Coordinator returned an invalid remote scope receipt.',
      )
    }
  })

  it('keeps only decision-critical evidence state in decisionOnly mode', () => {
    expect(
      applyLifecycleResponseMode(
        {
          assessment: { id: 'assessment-1', status: 'EVIDENCE_REVIEW' },
          evidenceSetHash: 'sha256:evidence',
          evidenceReceiptCount: 1,
          targetOutcome: null,
          readiness: { ready: true, blockers: [], runtimeCells: [{ large: 'omitted' }] },
          decisions: [],
          evidenceReceipts: [{ large: 'omitted' }],
          revision: { large: 'omitted' },
        },
        'decisionOnly',
      ),
    ).toEqual(
      expect.objectContaining({
        assessment: { id: 'assessment-1', status: 'EVIDENCE_REVIEW' },
        evidenceSetHash: 'sha256:evidence',
        evidenceReceiptCount: 1,
        targetOutcome: null,
        decisions: [],
      }),
    )
    expect(
      applyLifecycleResponseMode({ revision: { large: true }, evidenceReceipts: [{ large: true }] }, 'decisionOnly'),
    ).not.toHaveProperty('evidenceReceipts')
  })

  it('preserves the exact not_evaluated target outcome for packet-integrity review', () => {
    expect(
      applyLifecycleResponseMode(
        {
          assessment: { id: 'assessment-remote-1', status: 'EVIDENCE_REVIEW' },
          evidenceSetHash: 'sha256:empty-evidence-set',
          evidenceReceiptCount: 0,
          targetOutcome: 'not_evaluated',
          readiness: { ready: true, blockers: [] },
          decisions: [],
        },
        'decisionOnly',
      ),
    ).toEqual(
      expect.objectContaining({
        assessment: { id: 'assessment-remote-1', status: 'EVIDENCE_REVIEW' },
        evidenceSetHash: 'sha256:empty-evidence-set',
        evidenceReceiptCount: 0,
        targetOutcome: 'not_evaluated',
      }),
    )
  })
})
