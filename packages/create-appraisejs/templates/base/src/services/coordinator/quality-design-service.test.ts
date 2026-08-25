import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { createCustomExtensionPolicy } from '@/lib/validation-ast/extension-policy'
import { resolveTargetProject } from '@/services/target-project/target-project-service'
import { publishQualityValidationRuntime } from '@/services/coordinator/quality-validation-publication-service'

import {
  answerQualityRequirementQueries,
  approveQualityRequirements,
  approveQualityValidationDesign,
  compileQualityValidations,
  createQualityAssessment,
  createQualityAssessmentSuccessor,
  decideQualityAssessment,
  listQualityAssessments,
  listQualityPlans,
  publishQualityValidations,
  proposeQualityValidationDesign,
  readQualityAssessment,
  readQualityRequirementGraph,
  submitQualityRequirementSource,
} from './quality-design-service'

type FakeRecord = Record<string, unknown> & { id: string }
type FakeWhere = Record<string, unknown>
type FakeWriteArgs<TData extends Record<string, unknown> = Record<string, unknown>> = { data: TData }
type FakeWhereArgs<TWhere extends FakeWhere = FakeWhere> = { where: TWhere }
type QualityDesignClient = NonNullable<Parameters<typeof submitQualityRequirementSource>[1]>
type FakeUpdateArgs<
  TWhere extends FakeWhere = FakeWhere,
  TData extends Record<string, unknown> = Record<string, unknown>,
> = FakeWhereArgs<TWhere> & FakeWriteArgs<TData>

type FakeQualityPlan = FakeRecord & {
  targetProjectId: string
  title: string
  description: string | null
}
type FakeRequirementSnapshot = FakeRecord & {
  qualityPlanRevisionId: string
  externalRef: string | null
  text: string
  kind: string
  contentHash: string
}
type FakeObligation = FakeRecord & {
  qualityPlanRevisionId: string
  requirementAnalysisRevisionId: string
  requirementSnapshotId: string
  title: string
  intent: string
  assertionScopeJson: string
  minimumAssurance: string
  limitations: string | null
  contentHash: string
}
type FakeQuery = FakeRecord & {
  qualityPlanRevisionId: string
  prompt: string
  status: 'BLOCKING' | 'DEFERRED' | 'ACCEPTED_ASSUMPTION' | 'ANSWERED'
  answer: string | null
  rationale: string | null
}
type FakeValidationVersion = FakeRecord & {
  qualityPlanRevisionId: string
  validationDesignRevisionId: string
  validationIdentity: string
  version: number
  status: string
  reuseOutcome: string | null
  canonicalAstJson: string
  canonicalHash: string
  realizationJson?: string | null
  realizationHash?: string | null
  compilationHash?: string | null
  scenarioApprovedAt?: Date | null
  scenarioApprovedBy?: string | null
  scenarioApprovalHash?: string | null
}
type FakeRevision = FakeRecord & {
  targetProjectId: string
  qualityPlanId: string
  revision: number
  status: string
  approvedAt: Date | null
  contentHash: string
  sourceSpecification: string
  requirementGraphJson: string
  methodologyId: string
  methodologyVersion: string
  methodologyHash: string
}
type FakeRequirementAnalysis = FakeRecord & { qualityPlanRevisionId: string; revision: number }
type FakeValidationDesign = FakeRecord & { qualityPlanRevisionId: string; revision: number; designHash: string }
type FakeAssessmentFinding = FakeRecord & {
  assessmentId: string
  qualityObligationRevisionId: string
  outcome: string
  attribution: string
  evidenceSetHash: string
  findingHash: string
  reviewStatus: string
  reviewHash: string | null
}
type FakeEvaluationSubject = FakeRecord & {
  subjectDigest: string
  subjectKind: string
  authority: string
  metadataJson: string | null
}
type FakeAssessment = FakeRecord & {
  targetProjectId: string
  qualityPlanId: string
  qualityPlanRevisionId: string
  evaluationSubjectRevisionId: string
  status: string
  alignment: string
  observedAssurance: string | null
  baselineAssessmentId: string | null
  lineageId: string
  generation: number
  supersedesAssessmentId: string | null
  supersessionDispositionJson: string | null
  successorIdempotencyKey: string | null
  successorRequestHash: string | null
  evidenceReceipts: unknown[]
  findings?: FakeAssessmentFinding[]
  targetProjectKind?: 'LOCAL_WORKSPACE' | 'REMOTE_BLACK_BOX'
  runs?: FakeAssessmentRun[]
}
type FakeAssessmentRun = {
  id?: string
  status?: string
  stopReason?: string | null
  createdAt?: Date
  bindings: Array<{
    evidenceReceiptId: string | null
    terminalOutcome: string | null
    terminalizedAt?: Date | null
    integrityRejectionCode?: string | null
    testRun: {
      id?: string
      status?: string
      result?: string
      evidenceHealth?: string
      targetProjectId: string
      targetProject: { kind: string }
      environment: { id: string }
      environmentSnapshotHash: string | null
      environmentSnapshotJson: string | null
      environmentSnapshotVersion: number | null
    }
  }>
}
type FakeAssessmentDecision = FakeRecord & {
  assessmentId: string
  decision: string
  rationale: string
  decidedBy: string
  decidedAt: Date
  decisionHash: string
}

function matchesOptionalAssessmentField(actual: string | null, expected: unknown) {
  return !expected || actual === expected
}

function matchesAssessmentWhere(assessment: FakeAssessment, where: FakeWhere) {
  return [
    matchesOptionalAssessmentField(assessment.id, where.id),
    matchesOptionalAssessmentField(assessment.targetProjectId, where.targetProjectId),
    matchesOptionalAssessmentField(assessment.qualityPlanRevisionId, where.qualityPlanRevisionId),
    matchesOptionalAssessmentField(assessment.evaluationSubjectRevisionId, where.evaluationSubjectRevisionId),
    matchesOptionalAssessmentField(assessment.supersedesAssessmentId, where.supersedesAssessmentId),
    matchesOptionalAssessmentField(assessment.successorIdempotencyKey, where.successorIdempotencyKey),
  ].every(Boolean)
}

vi.mock('@/services/target-project/target-project-service', () => ({
  resolveTargetProject: vi.fn(async () => ({
    id: 'target-1',
    fingerprint: `sha256:${'a'.repeat(64)}`,
    canonicalPath: '/tmp/target',
  })),
}))

vi.mock('@/services/coordinator/quality-validation-publication-service', () => ({
  publishQualityValidationRuntime: vi.fn(async () => undefined),
}))

vi.mock('@/services/coordinator/remote-evaluation-scope-service', () => ({
  assertRemoteEvaluationScopeCurrent: vi.fn(),
  assertRemoteEvaluationScopeEnvironmentSnapshot: vi.fn(),
  parseRemoteSubjectReference: vi.fn(() => null),
  resolveRemoteEvaluationScopeSubject: vi.fn(),
}))

const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`

function sealedRuntimePublication() {
  const h = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`
  const receiptHash = h('5')
  const publicationId = `astpub_${receiptHash.slice('sha256:'.length)}`
  const invocation = {
    step: { id: 'step-checkout', version: '1.0.0', definitionHash: h('4') },
    inputs: {},
    presentation: { keyword: 'Given' as const, description: 'checkout is ready' },
  }
  const gherkin = ['Scenario: checkout is ready\n  Given checkout is ready']
  const compilerReceipt = {
    schemaVersion: '1' as const,
    catalogHash: h('1'),
    locatorGraphHash: h('2'),
    environments: ['env-local'],
    browsers: ['chromium'],
    runtimes: ['node'],
  }
  const runtimeInput = {
    schemaVersion: '2' as const,
    targetProjectId: 'target-1',
    targetFingerprint: h('a'),
    astId: 'quality-validation',
    astHash: h('b'),
    contextHash: h('c'),
    previewHash: h('d'),
    receiptHash,
    compilerReceipt: { ...compilerReceipt, contentHash: hash(compilerReceipt) },
    extensionPolicy: createCustomExtensionPolicy({
      projectId: 'target-1',
      projectFingerprint: h('a'),
      capabilityImports: {},
    }),
    rootInvocations: [{ caseId: 'case-checkout', stepId: 'case-checkout-step', invocation }],
    stepDefinitions: [invocation.step],
    locators: [],
    extensions: [],
    matrix: [{ browser: 'chromium', environment: 'env-local' }],
    expected: {
      scenarios: [{ scenarioId: 'scenario-checkout', caseId: 'case-checkout', stepIds: ['case-checkout-step'] }],
      scenarioCount: 1,
    },
    gherkinHash: hash(gherkin),
  }
  const node = {
    id: 'quality-validation',
    testCaseIds: ['case-checkout'],
    appraiseArtifacts: {
      modules: [{ id: 'module-checkout', name: 'Checkout' }],
      locatorGroups: [],
      testSuites: [
        { id: 'suite-checkout', name: 'Checkout', moduleId: 'module-checkout', testCaseIds: ['case-checkout'] },
      ],
      testCases: [
        {
          id: 'case-checkout',
          title: 'Checkout',
          description: 'Checkout succeeds.',
          steps: [
            { id: 'case-checkout-step', order: 1, label: 'ready', gherkinStep: 'Given checkout is ready', invocation },
          ],
        },
      ],
      locators: [],
    },
    astProvenance: {
      schemaVersion: '2' as const,
      astHash: h('b'),
      executionAuthority: 'reviewed_publication' as const,
      publishOperationId: publicationId,
      receiptHash,
      runtimeInputHash: hash(runtimeInput),
    },
    matrix: runtimeInput.matrix,
  }
  return {
    idempotencyKey: 'quality-publication-fixture',
    projection: { validationNode: node, gherkin },
    validationProjection: { validations: [node], gherkin },
    runtimeInput,
  }
}

describe('quality design coordinator service', () => {
  let client: ReturnType<typeof createWorkingFakeClient>

  beforeEach(() => {
    client = createWorkingFakeClient()
    vi.mocked(publishQualityValidationRuntime).mockImplementation(async (input, publicationClient) => {
      await (publicationClient as unknown as typeof client).validationVersion.update({
        where: { id: input.validationVersionId },
        data: {
          activeGeneration: {
            id: `generation-${input.validationVersionId}`,
            generationKey: `sha256:generation-${input.validationVersionId}`,
            disposition: 'ACTIVE',
            preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v2',
            preflightAuthority: 'appraisejs:quality-validation-publication:v2',
            canonicalRealizationJson: '{}',
            realizationHash: `sha256:realization-${input.validationVersionId}`,
            publication: {
              id: `publication-${input.validationVersionId}`,
              generationId: `generation-${input.validationVersionId}`,
              operationHash: `sha256:publication-${input.validationVersionId}`,
              phase: 'review_ready',
              preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v2',
              preflightAuthority: 'appraisejs:quality-validation-publication:v2',
              preflightDisposition: 'ACTIVE',
              runtimeInputHash: hash(input.runtimeInput),
              runtimeInputJson: JSON.stringify(input.runtimeInput),
              receiptHash: input.receiptHash,
            },
          },
        },
      } as never)
      return undefined as never
    })
  })

  async function executableFixture(idempotencyKey: string) {
    const requirements = await submitQualityRequirementSource(
      {
        target: 'target-1',
        idempotencyKey: `${idempotencyKey}-source`,
        source: {
          title: 'Generation authority',
          requirements: [{ text: 'Executable evidence needs a current generation.' }],
        },
      },
      client,
    )
    await approveQualityRequirements(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        expectedRevisionHash: requirements.revision.contentHash,
        approvedBy: 'reviewer',
      },
      client,
    )
    const proposal = await proposeQualityValidationDesign(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        idempotencyKey: `${idempotencyKey}-proposal`,
        proposal: {
          scenarios: [
            {
              obligationIds: [requirements.obligations[0]!.id],
              behavior: 'The generation is executable.',
              assertions: ['the reviewed publication is current'],
              coverage: {},
              matrixIntent: { browsers: ['chromium'] },
              limitations: [],
            },
          ],
        },
      },
      client,
    )
    const approved = await approveQualityValidationDesign(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        expectedDesignHash: proposal.designHash!,
        approvedBy: 'reviewer',
      },
      client,
    )
    const realized = await compileQualityValidations(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        expectedDesignHash: approved.designHash!,
        realization: { default: sealedRuntimePublication() },
      },
      client,
    )
    const published = await publishQualityValidations(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        validationVersionIds: [realized.validationVersions[0]!.id],
        expectedCompilationHash: realized.compilationHash,
      },
      client,
    )
    return { requirements, published, validation: published.validationVersions[0]! }
  }

  it('creates a Quality Plan revision with requirement obligations', async () => {
    const result = await submitQualityRequirementSource(
      {
        target: 'target-1',
        idempotencyKey: 'source-1',
        source: { title: 'Checkout quality', requirements: [{ text: 'Checkout requires a receipt.' }] },
      },
      client,
    )

    expect(result.idempotent).toBe(false)
    expect(result.requirements).toHaveLength(1)
    expect(result.obligations).toHaveLength(1)
    expect(result.approval).toEqual({ blocked: false })
    expect(result.revision.contentHash).toMatch(/^sha256:/)
    expect(result.revision.methodology).toMatchObject({ methodologyId: 'quality-os-core', version: '1.0.0' })
    expect(client.requirementAnalysisRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          decision: 'APPROVED',
          qualityPlanRevisionId: result.revision.id,
        }),
      }),
    )
    expect(client.qualityObligationRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ requirementAnalysisRevisionId: expect.any(String) }) }),
    )

    await expect(readQualityRequirementGraph({ qualityPlanId: result.qualityPlan.id }, client)).resolves.toMatchObject({
      revision: { id: result.revision.id, contentHash: result.revision.contentHash },
      nextRecommendedAction: expect.stringContaining('requirements_approve'),
    })
  })

  it('treats historical PUBLISHED status without an active generation as non-executable', async () => {
    const fixture = await executableFixture('published-without-generation')
    await client.validationVersion.update({
      where: { id: fixture.validation.id },
      data: { status: 'PUBLISHED', activeGeneration: null },
    })

    const graph = await readQualityRequirementGraph(
      { qualityPlanId: fixture.requirements.qualityPlan.id, revisionId: fixture.requirements.revision.id },
      client,
    )
    const assessment = await createQualityAssessment(
      {
        qualityPlanId: fixture.requirements.qualityPlan.id,
        revisionId: fixture.requirements.revision.id,
        idempotencyKey: 'published-without-generation-assessment',
        subject: { subjectDigest: `sha256:${'b'.repeat(64)}`, authority: 'artifact://missing-generation' },
      },
      client,
    )

    expect(graph.validationVersions[0]).toMatchObject({ status: 'PUBLISHED', activeGeneration: null })
    expect(graph.nextRecommendedAction).not.toContain('run the published validations')
    expect(assessment.readiness).toMatchObject({
      ready: false,
      blockers: ['All validation versions must have an active executable generation for this assessment.'],
    })
  })

  it('uses the supported active generation, not historical status, for readiness and runtime input hash projection', async () => {
    const fixture = await executableFixture('active-generation-readiness')
    await client.validationVersion.update({
      where: { id: fixture.validation.id },
      data: { status: 'SCENARIO_APPROVED' },
    })

    const assessment = await createQualityAssessment(
      {
        qualityPlanId: fixture.requirements.qualityPlan.id,
        revisionId: fixture.requirements.revision.id,
        idempotencyKey: 'active-generation-readiness-assessment',
        subject: { subjectDigest: `sha256:${'c'.repeat(64)}`, authority: 'artifact://active-generation' },
      },
      client,
    )

    expect(assessment.readiness.ready).toBe(true)
    expect(assessment.revision.validationVersions[0]).toMatchObject({
      status: 'SCENARIO_APPROVED',
      activeGeneration: { runtimeInputHash: hash(sealedRuntimePublication().runtimeInput) },
    })
  })

  it('fails closed for a foreign authority and binds current evidence to the exact publication tuple', async () => {
    const fixture = await executableFixture('generation-evidence-identity')
    const active = fixture.validation.activeGeneration!
    const assessment = await createQualityAssessment(
      {
        qualityPlanId: fixture.requirements.qualityPlan.id,
        revisionId: fixture.requirements.revision.id,
        idempotencyKey: 'generation-evidence-identity-assessment',
        subject: { subjectDigest: `sha256:${'d'.repeat(64)}`, authority: 'artifact://evidence-generation' },
      },
      client,
    )
    const receipt = {
      id: 'receipt-generation-identity',
      receiptHash: 'sha256:receipt-generation-identity',
      validationVersionId: fixture.validation.id,
      resultMatrixCell: 'CHROMIUM:env-local',
      outcome: 'PASSED',
      generationId: active.id,
      publicationId: active.publicationId,
      publicationOperationHash: active.operationHash,
    }
    await client.assessment.update({
      where: { id: assessment.assessment.id },
      data: { status: 'EVIDENCE_REVIEW', evidenceReceipts: [receipt] },
    })
    const first = await readQualityAssessment(assessment.assessment.id, client)
    await client.validationVersion.update({ where: { id: fixture.validation.id }, data: { status: 'REALIZED' } })
    const statusOnly = await readQualityAssessment(assessment.assessment.id, client)
    await client.assessment.update({
      where: { id: assessment.assessment.id },
      data: { evidenceReceipts: [{ ...receipt, publicationOperationHash: 'sha256:other-publication' }] },
    })
    const changedPublication = await readQualityAssessment(assessment.assessment.id, client)
    await client.validationVersion.update({
      where: { id: fixture.validation.id },
      data: { activeGeneration: { ...active, preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v1' } },
    })
    const unsupported = await readQualityAssessment(assessment.assessment.id, client)
    await client.validationVersion.update({
      where: { id: fixture.validation.id },
      data: { activeGeneration: { ...active, preflightAuthority: 'foreign:authority' } },
    })
    const foreign = await readQualityAssessment(assessment.assessment.id, client)

    expect(statusOnly.evidenceSetHash).toBe(first.evidenceSetHash)
    expect(changedPublication.evidenceSetHash).not.toBe(first.evidenceSetHash)
    expect(changedPublication.evidenceReceiptCount).toBe(0)
    expect(unsupported.readiness.ready).toBe(false)
    expect(foreign.readiness.ready).toBe(false)
  })

  it('rejects a raw descriptor at remote assessment creation before creating a subject or root reservation', async () => {
    const requirements = await submitQualityRequirementSource(
      {
        target: 'target-1',
        idempotencyKey: 'remote-descriptor-source',
        source: { title: 'Remote descriptor guard', requirements: [{ text: 'Scope identity is required.' }] },
      },
      client,
    )
    vi.mocked(resolveTargetProject).mockResolvedValueOnce({
      id: 'target-1',
      kind: 'REMOTE_BLACK_BOX',
      fingerprint: `sha256:${'a'.repeat(64)}`,
    } as never)
    await expect(
      createQualityAssessment(
        {
          qualityPlanId: requirements.qualityPlan.id,
          revisionId: requirements.revision.id,
          idempotencyKey: 'remote-descriptor-assessment',
          subject: { subjectDigest: `sha256:${'b'.repeat(64)}`, authority: 'artifact://forbidden' },
        },
        client,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(client.evaluationSubjectRevision.create).not.toHaveBeenCalled()
    expect(client.assessment.create).not.toHaveBeenCalled()
  })

  it('returns lifecycle guidance for the current revision state after requirement approval', async () => {
    const result = await submitQualityRequirementSource(
      {
        target: 'target-1',
        idempotencyKey: 'state-guidance-source',
        source: { title: 'State guidance', requirements: [{ text: 'Checkout is observable.' }] },
      },
      client,
    )

    await approveQualityRequirements(
      {
        qualityPlanId: result.qualityPlan.id,
        revisionId: result.revision.id,
        expectedRevisionHash: result.revision.contentHash,
        approvedBy: 'reviewer',
      },
      client,
    )

    await expect(
      readQualityRequirementGraph({ qualityPlanId: result.qualityPlan.id, revisionId: result.revision.id }, client),
    ).resolves.toMatchObject({
      revision: { status: 'REQUIREMENTS_APPROVED' },
      nextRecommendedAction: expect.stringContaining('validation_design_propose'),
    })
  })

  it('lists Quality Plans and assessments within the requested project scope', async () => {
    const qualityPlan = await submitQualityRequirementSource(
      {
        target: 'target-1',
        idempotencyKey: 'list-source',
        source: { title: 'Scoped quality', requirements: [{ text: 'A scoped requirement.' }] },
      },
      client,
    )

    const assessments = await listQualityAssessments({ targetProjectId: 'target-1' }, client)
    const plans = await listQualityPlans({ targetProjectId: 'target-1' }, client)

    expect(plans).toMatchObject([{ qualityPlan: { id: qualityPlan.qualityPlan.id, title: 'Scoped quality' } }])
    expect(assessments).toEqual([])
  })

  it('blocks approval when source analysis has unresolved blocking queries', async () => {
    const result = await submitQualityRequirementSource(
      { target: 'target-1', idempotencyKey: 'source-2', source: { title: 'Empty spec' } },
      client,
    )

    await expect(
      approveQualityRequirements(
        {
          qualityPlanId: result.qualityPlan.id,
          revisionId: result.revision.id,
          expectedRevisionHash: result.revision.contentHash,
          approvedBy: 'reviewer',
        },
        client,
      ),
    ).rejects.toThrow('Blocking requirement queries prevent Quality Plan revision approval')
  })

  it('rejects requirement query answers outside the selected revision', async () => {
    const first = await submitQualityRequirementSource(
      { target: 'target-1', idempotencyKey: 'source-3', source: { title: 'First empty spec' } },
      client,
    )
    const second = await submitQualityRequirementSource(
      { target: 'target-1', idempotencyKey: 'source-4', source: { title: 'Second empty spec' } },
      client,
    )

    await expect(
      answerQualityRequirementQueries(
        {
          qualityPlanId: first.qualityPlan.id,
          revisionId: first.revision.id,
          idempotencyKey: 'answer-1',
          answers: [{ queryId: second.queries[0]!.id, status: 'ACCEPTED_ASSUMPTION', rationale: 'Wrong revision.' }],
        },
        client,
      ),
    ).rejects.toThrow('Requirement query does not belong to this Quality Plan revision')
  })

  it('proposes and approves obligation-linked scenario designs after requirement approval', async () => {
    const requirements = await submitQualityRequirementSource(
      {
        target: 'target-1',
        idempotencyKey: 'source-5',
        source: { title: 'Checkout quality', requirements: [{ text: 'Checkout requires a receipt.' }] },
      },
      client,
    )
    await approveQualityRequirements(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        expectedRevisionHash: requirements.revision.contentHash,
        approvedBy: 'reviewer',
      },
      client,
    )

    const proposal = await proposeQualityValidationDesign(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        idempotencyKey: 'scenario-1',
        proposal: {
          scenarios: [
            {
              id: 'receipt-scenario',
              obligationIds: [requirements.obligations[0]!.id],
              behavior: 'Complete checkout and show a receipt.',
              assertions: ['receipt is visible'],
              coverage: { obligation: 'receipt' },
              matrixIntent: { browsers: ['chromium'] },
              limitations: [],
            },
          ],
        },
      },
      client,
    )

    expect(proposal.revision.status).toBe('SCENARIO_REVIEW')
    expect(proposal.validationVersions).toHaveLength(1)
    expect(proposal.designHash).toMatch(/^sha256:/)

    const reproposal = await proposeQualityValidationDesign(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        idempotencyKey: 'scenario-1-retry',
        proposal: {
          scenarios: [
            {
              id: 'receipt-scenario',
              obligationIds: [requirements.obligations[0]!.id],
              behavior: 'Complete checkout and show a receipt.',
              assertions: ['receipt is visible'],
              coverage: { obligation: 'receipt' },
              matrixIntent: { browsers: ['chromium'] },
              limitations: [],
            },
          ],
        },
      },
      client,
    )
    expect(reproposal.validationVersions).toHaveLength(1)

    await expect(
      approveQualityValidationDesign(
        {
          qualityPlanId: requirements.qualityPlan.id,
          revisionId: requirements.revision.id,
          expectedDesignHash: proposal.designHash!,
          approvedBy: 'reviewer',
        },
        client,
      ),
    ).resolves.toMatchObject({
      revision: { status: 'SCENARIOS_APPROVED' },
      validationVersions: [{ scenarioApprovedBy: 'reviewer', scenarioApprovalHash: proposal.designHash }],
    })
  })

  it('rejects under-specified scenario designs before review', async () => {
    const requirements = await submitQualityRequirementSource(
      {
        target: 'target-1',
        idempotencyKey: 'source-6',
        source: { title: 'Checkout quality', requirements: [{ text: 'Checkout requires a receipt.' }] },
      },
      client,
    )
    await approveQualityRequirements(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        expectedRevisionHash: requirements.revision.contentHash,
        approvedBy: 'reviewer',
      },
      client,
    )

    await expect(
      proposeQualityValidationDesign(
        {
          qualityPlanId: requirements.qualityPlan.id,
          revisionId: requirements.revision.id,
          idempotencyKey: 'scenario-2',
          proposal: { scenarios: [{ obligationIds: [requirements.obligations[0]!.id], assertions: [] }] },
        },
        client,
      ),
    ).rejects.toThrow('Scenario proposals require behavioral intent')
  })

  it('creates assessment review packets and blocks decisions until evidence is ready', async () => {
    const requirements = await submitQualityRequirementSource(
      {
        target: 'target-1',
        idempotencyKey: 'source-7',
        source: { title: 'Checkout quality', requirements: [{ text: 'Checkout requires a receipt.' }] },
      },
      client,
    )
    await approveQualityRequirements(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        expectedRevisionHash: requirements.revision.contentHash,
        approvedBy: 'reviewer',
      },
      client,
    )
    const proposal = await proposeQualityValidationDesign(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        idempotencyKey: 'scenario-3',
        proposal: {
          scenarios: [
            {
              obligationIds: [requirements.obligations[0]!.id],
              behavior: 'Complete checkout and show a receipt.',
              assertions: ['receipt is visible'],
              coverage: { obligation: 'receipt' },
              matrixIntent: { browsers: ['chromium'] },
              limitations: [],
            },
          ],
        },
      },
      client,
    )
    await approveQualityValidationDesign(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        expectedDesignHash: proposal.designHash!,
        approvedBy: 'reviewer',
      },
      client,
    )

    const realized = await compileQualityValidations(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        expectedDesignHash: proposal.designHash!,
        realization: {
          default: sealedRuntimePublication(),
        },
      },
      client,
    )
    expect(realized.revision.status).toBe('REALIZED')
    expect(realized.compilationHash).toMatch(/^sha256:/)
    expect(realized.validationVersions[0]).toMatchObject({ status: 'REALIZED' })

    const published = await publishQualityValidations(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        validationVersionIds: [realized.validationVersions[0]!.id],
        expectedCompilationHash: realized.compilationHash,
      },
      client,
    )
    expect(published.validationVersions[0]).toMatchObject({ status: 'PUBLISHED' })
    expect(published.nextRecommendedAction).toContain('assessment')
    const activePublication = published.validationVersions[0]!.activeGeneration!
    const evidenceTuple = {
      validationVersionId: published.validationVersions[0]!.id,
      generationId: activePublication.id,
      publicationId: activePublication.publicationId,
      publicationOperationHash: activePublication.operationHash,
    }

    const assessment = await createQualityAssessment(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        idempotencyKey: 'assessment-1',
        subject: { subjectDigest: `sha256:${'a'.repeat(64)}`, authority: 'artifact://build-1' },
      },
      client,
    )

    expect(assessment.readiness.ready).toBe(true)
    expect(assessment.readiness.blockers).toEqual([])
    expect(assessment.assessment.status).toBe('READY')
    expect(assessment.evidenceReceiptCount).toBe(0)

    await client.assessment.update({
      where: { id: assessment.assessment.id },
      data: {
        runs: [
          {
            id: 'assessment-run-terminal',
            status: 'COMPLETED',
            stopReason: null,
            createdAt: new Date('2026-08-24T14:00:00.000Z'),
            bindings: [
              {
                evidenceReceiptId: null,
                terminalOutcome: 'FAILED',
                terminalizedAt: new Date('2026-08-24T14:00:01.000Z'),
                testRun: {
                  id: 'test-run-infrastructure-failure',
                  status: 'COMPLETED',
                  result: 'FAILED',
                  evidenceHealth: 'infrastructure_failure',
                  targetProjectId: 'target-1',
                  targetProject: { kind: 'LOCAL_WORKSPACE' },
                  environment: { id: 'env-local' },
                  environmentSnapshotHash: null,
                  environmentSnapshotJson: null,
                  environmentSnapshotVersion: null,
                },
              },
            ],
          },
        ],
      },
    })
    const terminalDiagnostic = await readQualityAssessment(assessment.assessment.id, client)
    expect(terminalDiagnostic.assessmentRun).toMatchObject({
      id: 'assessment-run-terminal',
      status: 'COMPLETED',
      testRuns: [
        {
          id: 'test-run-infrastructure-failure',
          status: 'COMPLETED',
          result: 'FAILED',
          evidenceHealth: 'infrastructure_failure',
        },
      ],
    })
    expect(terminalDiagnostic.nextRecommendedAction).toContain('assessment_prepare_run')
    expect(terminalDiagnostic.nextRecommendedAction).not.toContain('assessment_run to collect')
    await client.assessment.update({ where: { id: assessment.assessment.id }, data: { runs: [] } })

    await expect(
      decideQualityAssessment(
        {
          assessmentId: assessment.assessment.id,
          expectedEvidenceSetHash: assessment.evidenceSetHash,
          decision: 'accepted_with_limitations',
          decidedBy: 'reviewer',
          rationale: 'Evidence-only dry review.',
        },
        client,
      ),
    ).rejects.toThrow('Assessment decisions require sealed evidence receipts')

    await client.assessment.update({
      where: { id: assessment.assessment.id },
      data: { status: 'READY', evidenceReceipts: [{ receiptHash: 'sha256:evidence-1', ...evidenceTuple }] },
    })
    const evidenceReady = await readQualityAssessment(assessment.assessment.id, client)
    await expect(
      decideQualityAssessment(
        {
          assessmentId: assessment.assessment.id,
          expectedEvidenceSetHash: evidenceReady.evidenceSetHash,
          decision: 'accepted_with_limitations',
          decidedBy: 'reviewer',
          rationale: 'Evidence is present but not reviewed.',
        },
        client,
      ),
    ).rejects.toThrow('Assessment decisions require evidence review')

    await client.assessment.update({
      where: { id: assessment.assessment.id },
      data: {
        status: 'EVIDENCE_REVIEW',
        evidenceReceipts: [{ receiptHash: 'sha256:blocked-1', outcome: 'BLOCKED', ...evidenceTuple }],
      },
    })
    const blocked = await readQualityAssessment(assessment.assessment.id, client)
    expect(blocked.targetOutcome).toBe('not_evaluated')
    await expect(
      decideQualityAssessment(
        {
          assessmentId: assessment.assessment.id,
          expectedEvidenceSetHash: blocked.evidenceSetHash,
          decision: 'rejected',
          decidedBy: 'reviewer',
          rationale: 'Blocked evidence cannot evaluate the target.',
        },
        client,
      ),
    ).rejects.toThrow('target remains not evaluated')

    // Reconciliation terminalized this remote legacy artifact cell as
    // INCONCLUSIVE before receipt creation because its frozen packet was
    // missing. Review must surface the exact target outcome even though there
    // is no BLOCKED receipt to infer it from.
    await client.assessment.update({
      where: { id: assessment.assessment.id },
      data: {
        status: 'READY',
        targetProjectKind: 'REMOTE_BLACK_BOX',
        evidenceReceipts: [],
        runs: [
          {
            bindings: [
              {
                evidenceReceiptId: null,
                terminalOutcome: 'INCONCLUSIVE',
                testRun: {
                  targetProjectId: 'target-1',
                  targetProject: { kind: 'REMOTE_BLACK_BOX' },
                  environment: { id: 'env-1' },
                  environmentSnapshotHash: null,
                  environmentSnapshotJson: null,
                  environmentSnapshotVersion: null,
                },
              },
            ],
          },
        ],
      },
    })
    const packetRejected = await readQualityAssessment(assessment.assessment.id, client)
    expect(packetRejected.evidenceReceiptCount).toBe(0)
    expect(packetRejected.targetOutcome).toBe('not_evaluated')
    await expect(
      decideQualityAssessment(
        {
          assessmentId: assessment.assessment.id,
          expectedEvidenceSetHash: packetRejected.evidenceSetHash,
          decision: 'rejected',
          decidedBy: 'reviewer',
          rationale: 'Packet integrity rejected the remote result before sealing evidence.',
        },
        client,
      ),
    ).rejects.toThrow('target remains not evaluated')

    // The same not-evaluated projection applies to a local managed-capsule
    // tuple rejection. It is explicit on the binding, so a normal unsealed
    // INCONCLUSIVE infrastructure outcome is not broadened into this state.
    await client.assessment.update({
      where: { id: assessment.assessment.id },
      data: {
        status: 'READY',
        targetProjectKind: 'LOCAL_WORKSPACE',
        evidenceReceipts: [],
        runs: [
          {
            bindings: [
              {
                evidenceReceiptId: null,
                terminalOutcome: 'INCONCLUSIVE',
                integrityRejectionCode: 'managed_capsule_integrity',
                testRun: {
                  targetProjectId: 'target-1',
                  targetProject: { kind: 'LOCAL_WORKSPACE' },
                  environment: { id: 'env-1' },
                },
              },
            ],
          },
        ],
      },
    })
    const managedIntegrityRejected = await readQualityAssessment(assessment.assessment.id, client)
    expect(managedIntegrityRejected).toMatchObject({
      assessment: { status: 'READY' },
      evidenceReceiptCount: 0,
      targetOutcome: 'not_evaluated',
    })

    await client.assessment.update({
      where: { id: assessment.assessment.id },
      data: {
        status: 'READY',
        targetProjectKind: 'LOCAL_WORKSPACE',
        evidenceReceipts: [],
        runs: [
          {
            bindings: [
              {
                evidenceReceiptId: null,
                terminalOutcome: 'INCONCLUSIVE',
                integrityRejectionCode: null,
                testRun: {
                  targetProjectId: 'target-1',
                  targetProject: { kind: 'LOCAL_WORKSPACE' },
                  environment: { id: 'env-1' },
                },
              },
            ],
          },
        ],
      },
    })
    expect((await readQualityAssessment(assessment.assessment.id, client)).targetOutcome).toBeNull()

    await client.assessment.update({
      where: { id: assessment.assessment.id },
      data: {
        status: 'EVIDENCE_REVIEW',
        targetProjectKind: 'LOCAL_WORKSPACE',
        runs: [],
        evidenceReceipts: [
          {
            id: 'receipt-blocked',
            receiptHash: 'sha256:blocked-1',
            outcome: 'BLOCKED',
            ...evidenceTuple,
            resultMatrixCell: 'CHROMIUM:env-1',
            sealedAt: new Date('2026-08-14T00:00:00.000Z'),
          },
          {
            id: 'receipt-fresh-failed',
            receiptHash: 'sha256:evidence-1',
            outcome: 'FAILED',
            ...evidenceTuple,
            resultMatrixCell: 'CHROMIUM:env-1',
            sealedAt: new Date('2026-08-14T00:01:00.000Z'),
          },
        ],
      },
    })
    const reviewed = await readQualityAssessment(assessment.assessment.id, client)
    expect(reviewed.targetOutcome).not.toBe('not_evaluated')
    expect(reviewed.evidenceReceipts).toHaveLength(1)
    expect(reviewed.findings).toEqual([])
    expect(reviewed.nextRecommendedAction).toContain('assessment_decide')
    expect(reviewed.nextRecommendedAction).not.toContain('assessment_run')
    await expect(
      decideQualityAssessment(
        {
          assessmentId: assessment.assessment.id,
          expectedEvidenceSetHash: reviewed.evidenceSetHash,
          decision: 'accepted_with_limitations',
          decidedBy: 'reviewer',
          rationale: 'Findings have not yet been attributed.',
        },
        client,
      ),
    ).rejects.toThrow('Every quality obligation requires an attributed finding')
    await client.assessmentFinding?.create({
      data: {
        assessmentId: assessment.assessment.id,
        qualityObligationRevisionId: requirements.obligations[0]!.id,
        outcome: 'SATISFIED',
        attribution: 'NOT_APPLICABLE',
        evidenceSetHash: reviewed.evidenceSetHash,
        findingHash: `sha256:${'b'.repeat(64)}`,
      },
    })
    await expect(
      decideQualityAssessment(
        {
          assessmentId: assessment.assessment.id,
          expectedEvidenceSetHash: reviewed.evidenceSetHash,
          decision: 'accepted_with_limitations',
          decidedBy: 'reviewer',
          rationale: 'Evidence review accepted limitations.',
        },
        client,
      ),
    ).resolves.toMatchObject({ assessment: { status: 'DECIDED' } })

    const decided = await readQualityAssessment(assessment.assessment.id, client)
    expect(decided.nextRecommendedAction).toContain('Assessment is decided')
    expect(decided.nextRecommendedAction).not.toContain('assessment_run')
    expect(decided.nextRecommendedAction).not.toContain('assessment_decide')
    await expect(
      decideQualityAssessment(
        {
          assessmentId: assessment.assessment.id,
          expectedEvidenceSetHash: decided.evidenceSetHash,
          decision: 'accepted_with_limitations',
          decidedBy: 'reviewer',
          rationale: 'Duplicate decision.',
        },
        client,
      ),
    ).rejects.toThrow('Assessment already has a decision')
  })

  it('creates exactly one immutable READY successor with lineage, idempotency, and no inherited evidence', async () => {
    const requirements = await submitQualityRequirementSource(
      {
        target: 'target-1',
        idempotencyKey: 'successor-source',
        source: { title: 'Retryable login', requirements: [{ text: 'Login reaches home.' }] },
      },
      client,
    )
    await approveQualityRequirements(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        expectedRevisionHash: requirements.revision.contentHash,
        approvedBy: 'reviewer',
      },
      client,
    )
    const proposal = await proposeQualityValidationDesign(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        idempotencyKey: 'successor-design',
        proposal: {
          scenarios: [
            {
              id: 'login',
              obligationIds: [requirements.obligations[0]!.id],
              behavior: 'Login reaches home.',
              assertions: ['home route'],
              coverage: {},
              matrixIntent: { browsers: ['chromium'] },
              limitations: [],
            },
          ],
        },
      },
      client,
    )
    const approved = await approveQualityValidationDesign(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        expectedDesignHash: proposal.designHash!,
        approvedBy: 'reviewer',
      },
      client,
    )
    const realized = await compileQualityValidations(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        expectedDesignHash: approved.designHash!,
        realization: { default: sealedRuntimePublication() },
      },
      client,
    )
    const published = await publishQualityValidations(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        validationVersionIds: [realized.validationVersions[0]!.id],
        expectedCompilationHash: realized.compilationHash,
      },
      client,
    )
    const predecessorGeneration = published.validationVersions[0]!.activeGeneration!
    const predecessor = await createQualityAssessment(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        idempotencyKey: 'successor-predecessor',
        subject: { subjectDigest: `sha256:${'c'.repeat(64)}`, authority: 'artifact://login-v1' },
      },
      client,
    )
    await client.assessment.update({
      where: { id: predecessor.assessment.id },
      data: {
        status: 'DECIDED',
        evidenceReceipts: [
          {
            id: 'receipt-predecessor',
            receiptHash: 'sha256:old',
            validationVersionId: published.validationVersions[0]!.id,
            generationId: predecessorGeneration.id,
            publicationId: predecessorGeneration.publicationId,
            publicationOperationHash: predecessorGeneration.operationHash,
          },
        ],
      },
    })
    const request = {
      assessmentId: predecessor.assessment.id,
      subject: { subjectDigest: `sha256:${'d'.repeat(64)}`, authority: 'artifact://login-v2' },
      disposition: { code: 'target_changed', rationale: 'A new deployment digest needs a fresh assessment.' },
      idempotencyKey: 'successor-retry-1',
    }
    const [successor, replay] = await Promise.all([
      createQualityAssessmentSuccessor(request, client),
      createQualityAssessmentSuccessor(request, client),
    ])
    expect(successor.assessment).toMatchObject({
      status: 'READY',
      lineageId: predecessor.assessment.lineageId,
      generation: 1,
      supersedesAssessmentId: predecessor.assessment.id,
    })
    expect(successor.subject.subjectDigest).toBe(request.subject.subjectDigest)
    expect(successor.evidenceReceiptCount).toBe(0)
    expect(successor.decisions).toEqual([])
    expect(replay.assessment.id).toBe(successor.assessment.id)
    const unchanged = await readQualityAssessment(predecessor.assessment.id, client)
    expect(unchanged.assessment.status).toBe('DECIDED')
    expect(unchanged.evidenceReceiptCount).toBe(1)
    await expect(
      createQualityAssessmentSuccessor(
        { ...request, subject: { ...request.subject, authority: 'artifact://different' } },
        client,
      ),
    ).rejects.toThrow('idempotency key was already used with different input')
    await expect(
      createQualityAssessmentSuccessor({ ...request, idempotencyKey: 'successor-retry-2' }, client),
    ).rejects.toThrow('already has an immutable successor')
  })

  it('rejects active predecessors and requires an explicit retry reason from evidence review', async () => {
    const requirements = await submitQualityRequirementSource(
      {
        target: 'target-1',
        idempotencyKey: 'active-source',
        source: { title: 'Active retry', requirements: [{ text: 'A retry preserves evidence.' }] },
      },
      client,
    )
    const active = await createQualityAssessment(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        idempotencyKey: 'active-predecessor',
        subject: { subjectDigest: `sha256:${'e'.repeat(64)}`, authority: 'artifact://active' },
      },
      client,
    )
    const base = {
      assessmentId: active.assessment.id,
      subject: { subjectDigest: `sha256:${'f'.repeat(64)}`, authority: 'artifact://retry' },
      disposition: { code: 'retry', rationale: 'Retry a completed assessment.' },
      idempotencyKey: 'active-successor',
    }
    await expect(createQualityAssessmentSuccessor(base, client)).rejects.toThrow('require a terminal predecessor')
    await client.assessment.update({ where: { id: active.assessment.id }, data: { status: 'EVIDENCE_REVIEW' } })
    await expect(createQualityAssessmentSuccessor(base, client)).rejects.toThrow('require an explicit retryReason')
    await expect(
      createQualityAssessmentSuccessor(
        { ...base, disposition: { ...base.disposition, retryReason: 'The runtime dependency was restored.' } },
        client,
      ),
    ).resolves.toMatchObject({ assessment: { status: 'READY', generation: 1 } })
  })

  it('reuses an exactly matching canonical evaluation subject revision for a successor', async () => {
    const requirements = await submitQualityRequirementSource(
      {
        target: 'target-1',
        idempotencyKey: 'subject-reuse-source',
        source: { title: 'Subject reuse', requirements: [{ text: 'A retry keeps its immutable subject.' }] },
      },
      client,
    )
    const subject = {
      subjectDigest: `sha256:${'1'.repeat(64)}`,
      subjectKind: 'DEPLOYMENT_SNAPSHOT' as const,
      authority: 'deployment://login/1',
      metadata: { build: '1', release: 'candidate' },
    }
    const predecessor = await createQualityAssessment(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        idempotencyKey: 'subject-reuse-predecessor',
        subject,
      },
      client,
    )
    await client.assessment.update({ where: { id: predecessor.assessment.id }, data: { status: 'DECIDED' } })

    await expect(
      createQualityAssessmentSuccessor(
        {
          assessmentId: predecessor.assessment.id,
          subject: { ...subject, metadata: { release: 'candidate', build: '1' } },
          disposition: { code: 'rerun', rationale: 'Repeat the exact immutable deployment assessment.' },
          idempotencyKey: 'subject-reuse-successor',
        },
        client,
      ),
    ).resolves.toMatchObject({ subject: { id: predecessor.subject.id, ...subject } })
  })

  it('rejects successor reuse when a matching digest has different authority, kind, or canonical metadata', async () => {
    const requirements = await submitQualityRequirementSource(
      {
        target: 'target-1',
        idempotencyKey: 'subject-conflict-source',
        source: { title: 'Subject conflict', requirements: [{ text: 'A retry cannot reinterpret a digest.' }] },
      },
      client,
    )
    const subject = {
      subjectDigest: `sha256:${'2'.repeat(64)}`,
      subjectKind: 'DEPLOYMENT_SNAPSHOT' as const,
      authority: 'deployment://login/2',
      metadata: { build: '2', release: 'candidate' },
    }
    const predecessor = await createQualityAssessment(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        idempotencyKey: 'subject-conflict-predecessor',
        subject,
      },
      client,
    )
    await client.assessment.update({ where: { id: predecessor.assessment.id }, data: { status: 'DECIDED' } })
    const successor = (replacement: Record<string, unknown>, idempotencyKey: string) =>
      createQualityAssessmentSuccessor(
        {
          assessmentId: predecessor.assessment.id,
          subject: { ...subject, ...replacement },
          disposition: { code: 'rerun', rationale: 'Repeat after a runtime interruption.' },
          idempotencyKey,
        },
        client,
      )

    await expect(
      successor({ authority: 'deployment://login/other' }, 'subject-conflict-authority'),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(successor({ subjectKind: 'ARTIFACT' }, 'subject-conflict-kind')).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(
      successor({ metadata: { build: 'different', release: 'candidate' } }, 'subject-conflict-metadata'),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('rejects final PUBLISHED status when a remote validation changes after projection', async () => {
    const requirements = await submitQualityRequirementSource(
      {
        target: 'target-1',
        idempotencyKey: 'remote-publication-source',
        source: { title: 'Remote publication CAS', requirements: [{ text: 'The published validation is immutable.' }] },
      },
      client,
    )
    await approveQualityRequirements(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        expectedRevisionHash: requirements.revision.contentHash,
        approvedBy: 'reviewer',
      },
      client,
    )
    const proposal = await proposeQualityValidationDesign(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        idempotencyKey: 'remote-publication-scenario',
        proposal: {
          scenarios: [
            {
              obligationIds: [requirements.obligations[0]!.id],
              behavior: 'Publish the immutable remote validation.',
              assertions: ['the publication is sealed'],
              coverage: {},
              matrixIntent: { browsers: ['chromium'] },
              limitations: [],
            },
          ],
        },
      },
      client,
    )
    await approveQualityValidationDesign(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        expectedDesignHash: proposal.designHash!,
        approvedBy: 'reviewer',
      },
      client,
    )
    const realized = await compileQualityValidations(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        expectedDesignHash: proposal.designHash!,
        realization: { default: sealedRuntimePublication() },
      },
      client,
    )
    const validationVersionId = realized.validationVersions[0]!.id
    vi.mocked(publishQualityValidationRuntime).mockImplementation(async (_input, publicationClient) => {
      await (publicationClient as unknown as typeof client).validationVersion.update({
        where: { id: validationVersionId },
        data: {
          activeGeneration: {
            id: 'remote-generation',
            generationKey: 'sha256:remote-generation',
            disposition: 'ACTIVE',
            preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v2',
            preflightAuthority: 'appraisejs:quality-validation-publication:v2',
            canonicalRealizationJson: '{}',
            realizationHash: 'sha256:remote-realization',
            publication: {
              id: 'remote-publication',
              generationId: 'remote-generation',
              operationHash: 'sha256:sealed-publication',
              phase: 'review_ready',
              preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v2',
              preflightAuthority: 'appraisejs:quality-validation-publication:v2',
              preflightDisposition: 'ACTIVE',
              runtimeInputHash: 'sha256:remote-runtime-input',
              runtimeInputJson: '{}',
              receiptHash: 'sha256:sealed-publication',
            },
          },
        },
      })
      return undefined as never
    })
    const transact = client.$transaction.bind(client) as <T>(
      operation: (transaction: QualityDesignClient) => Promise<T>,
    ) => Promise<T>
    ;(client as unknown as { $transaction: typeof transact }).$transaction = async operation => {
      await client.validationVersion.update({
        where: { id: validationVersionId },
        data: { canonicalHash: 'sha256:changed-after-projection' },
      })
      return transact(operation)
    }

    await expect(
      publishQualityValidations(
        {
          qualityPlanId: requirements.qualityPlan.id,
          revisionId: requirements.revision.id,
          validationVersionIds: [validationVersionId],
          expectedCompilationHash: realized.compilationHash,
          remoteScopeBinding: {
            subjectRevisionId: 'subject-1',
            targetProjectId: 'target-1',
            qualityPlanId: requirements.qualityPlan.id,
            qualityPlanRevisionId: requirements.revision.id,
            environmentId: 'environment-1',
            preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v2',
            scopeIntentHash: 'sha256:scope-intent',
            realizationIntentHash: 'sha256:realization-intent',
            preflightHash: 'sha256:preflight',
            scopeHash: 'sha256:scope',
            environmentSnapshotHash: 'sha256:environment',
            environmentSnapshotJson: '{}',
            environmentScopeVersion: 1,
            environmentUpdatedAt: new Date('2026-08-22T00:00:00.000Z'),
          },
        },
        client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { code: 'remote_evaluation_scope_stale' } })
    expect(
      (await readQualityRequirementGraph({ qualityPlanId: requirements.qualityPlan.id }, client)).validationVersions[0],
    ).toMatchObject({
      status: 'REALIZED',
      canonicalHash: 'sha256:changed-after-projection',
    })
  })

  it('requires full validation publication before assessment readiness', async () => {
    const requirements = await submitQualityRequirementSource(
      {
        target: 'target-1',
        idempotencyKey: 'source-8',
        source: {
          title: 'Checkout quality',
          requirements: [{ text: 'Checkout requires a receipt.' }, { text: 'Checkout requires an order id.' }],
        },
      },
      client,
    )
    await approveQualityRequirements(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        expectedRevisionHash: requirements.revision.contentHash,
        approvedBy: 'reviewer',
      },
      client,
    )
    const proposal = await proposeQualityValidationDesign(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        idempotencyKey: 'scenario-4',
        proposal: {
          scenarios: requirements.obligations.map((obligation, index) => ({
            id: `scenario-${index}`,
            obligationIds: [obligation.id],
            behavior: `Exercise obligation ${index}.`,
            assertions: ['expected value is visible'],
            coverage: { obligation: obligation.id },
            matrixIntent: { browsers: ['chromium'] },
            limitations: [],
          })),
        },
      },
      client,
    )
    await approveQualityValidationDesign(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        expectedDesignHash: proposal.designHash!,
        approvedBy: 'reviewer',
      },
      client,
    )
    const realized = await compileQualityValidations(
      {
        qualityPlanId: requirements.qualityPlan.id,
        revisionId: requirements.revision.id,
        expectedDesignHash: proposal.designHash!,
        realization: { default: sealedRuntimePublication() },
      },
      client,
    )

    await expect(
      compileQualityValidations(
        {
          qualityPlanId: requirements.qualityPlan.id,
          revisionId: requirements.revision.id,
          expectedDesignHash: proposal.designHash!,
          realization: {
            validations: [
              { validationVersionId: realized.validationVersions[0]!.id, realization: { stepInvocations: [] } },
            ],
          },
        },
        client,
      ),
    ).rejects.toThrow('Validation realization must cover every validation version exactly once')

    await expect(
      publishQualityValidations(
        {
          qualityPlanId: requirements.qualityPlan.id,
          revisionId: requirements.revision.id,
          validationVersionIds: [realized.validationVersions[0]!.id],
          expectedCompilationHash: realized.compilationHash,
        },
        client,
      ),
    ).rejects.toThrow('Validation publication must include the full realized validation set')
  })
})

function createWorkingFakeClient(): QualityDesignClient {
  const revisions: FakeRevision[] = []
  const plans: FakeQualityPlan[] = []
  const requirements: FakeRequirementSnapshot[] = []
  const obligations: FakeObligation[] = []
  const requirementAnalyses: FakeRequirementAnalysis[] = []
  const validationDesigns: FakeValidationDesign[] = []
  const queries: FakeQuery[] = []
  const validationVersions: FakeValidationVersion[] = []
  const obligationLinks: FakeRecord[] = []
  const subjects: FakeEvaluationSubject[] = []
  const assessments: FakeAssessment[] = []
  const decisions: FakeAssessmentDecision[] = []
  let id = 0
  const nextId = (prefix: string) => `${prefix}-${++id}`
  const hydrate = (revision: FakeRevision) => {
    const qualityPlan = plans.find(plan => plan.id === revision.qualityPlanId)
    if (!qualityPlan) throw new Error(`Missing fake Quality Plan ${revision.qualityPlanId}`)
    return {
      ...revision,
      qualityPlan,
      requirementSnapshots: requirements.filter(item => item.qualityPlanRevisionId === revision.id),
      obligations: obligations.filter(item => item.qualityPlanRevisionId === revision.id),
      queries: queries.filter(item => item.qualityPlanRevisionId === revision.id),
      validationVersions: validationVersions.filter(item => item.qualityPlanRevisionId === revision.id),
    }
  }
  const fake = {
    qualityPlanRevision: {
      findFirst: vi.fn(async ({ where }: FakeWhereArgs) => {
        const found = revisions.find(
          revision =>
            (!where.qualityPlanId || revision.qualityPlanId === where.qualityPlanId) &&
            (!where.targetProjectId || revision.targetProjectId === where.targetProjectId) &&
            (!where.contentHash || revision.contentHash === where.contentHash) &&
            (!where.id || revision.id === where.id),
        )
        return found ? hydrate(found) : null
      }),
      create: vi.fn(async ({ data }: FakeWriteArgs) => {
        const revision: FakeRevision = {
          id: nextId('revision'),
          targetProjectId: 'target-1',
          qualityPlanId: 'quality-plan-0',
          revision: 1,
          status: 'DRAFT',
          approvedAt: null,
          contentHash: 'sha256:uninitialized',
          sourceSpecification: '{}',
          requirementGraphJson: '{}',
          methodologyId: 'quality-os-core',
          methodologyVersion: '1.0.0',
          methodologyHash: `sha256:${'f'.repeat(64)}`,
          ...data,
        }
        revisions.push(revision)
        return hydrate(revision)
      }),
      update: vi.fn(async ({ where, data }: FakeUpdateArgs<{ id: string }>) => {
        const revision = revisions.find(item => item.id === where.id)
        if (!revision) throw new Error(`Missing fake revision ${where.id}`)
        Object.assign(revision, data)
        return hydrate(revision)
      }),
    },
    qualityPlan: {
      findFirst: vi.fn(
        async ({ where }: FakeWhereArgs) => plans.find(plan => !where.id || plan.id === where.id) ?? null,
      ),
      findMany: vi.fn(async ({ where }: FakeWhereArgs) =>
        plans.filter(plan => !where.targetProjectId || plan.targetProjectId === where.targetProjectId),
      ),
      create: vi.fn(async ({ data }: FakeWriteArgs) => {
        const plan: FakeQualityPlan = {
          id: nextId('quality-plan'),
          targetProjectId: 'target-1',
          title: 'Untitled Quality Plan',
          description: null,
          ...data,
        }
        plans.push(plan)
        return plan
      }),
      update: vi.fn(async ({ where, data }: FakeUpdateArgs<{ id: string }>) => {
        const plan = plans.find(item => item.id === where.id)
        if (!plan) throw new Error(`Missing fake Quality Plan ${where.id}`)
        Object.assign(plan, data)
        return plan
      }),
    },
    requirementSnapshot: {
      findFirst: vi.fn(
        async ({ where }: FakeWhereArgs) => requirements.find(item => !where.id || item.id === where.id) ?? null,
      ),
      create: vi.fn(async ({ data }: FakeWriteArgs) => {
        const snapshot: FakeRequirementSnapshot = {
          id: nextId('requirement'),
          qualityPlanRevisionId: 'revision-0',
          externalRef: null,
          text: '',
          kind: 'REQUIREMENT',
          contentHash: 'sha256:uninitialized',
          ...data,
        }
        requirements.push(snapshot)
        return snapshot
      }),
      update: vi.fn(async ({ where, data }: FakeUpdateArgs<{ id: string }>) => {
        const snapshot = requirements.find(item => item.id === where.id)
        if (!snapshot) throw new Error(`Missing fake requirement ${where.id}`)
        Object.assign(snapshot, data)
        return snapshot
      }),
    },
    qualityObligationRevision: {
      findFirst: vi.fn(
        async ({ where }: FakeWhereArgs) => obligations.find(item => !where.id || item.id === where.id) ?? null,
      ),
      create: vi.fn(async ({ data }: FakeWriteArgs) => {
        const obligation: FakeObligation = {
          id: nextId('obligation'),
          qualityPlanRevisionId: 'revision-0',
          requirementAnalysisRevisionId: 'legacy-analysis:revision-0',
          requirementSnapshotId: 'requirement-0',
          title: '',
          intent: '',
          assertionScopeJson: '{}',
          minimumAssurance: 'STANDARD',
          limitations: null,
          contentHash: 'sha256:uninitialized',
          ...data,
        }
        obligations.push(obligation)
        return obligation
      }),
      update: vi.fn(async ({ where, data }: FakeUpdateArgs<{ id: string }>) => {
        const obligation = obligations.find(item => item.id === where.id)
        if (!obligation) throw new Error(`Missing fake obligation ${where.id}`)
        Object.assign(obligation, data)
        return obligation
      }),
    },
    requirementAnalysisRevision: {
      findFirst: vi.fn(
        async ({ where }: FakeWhereArgs) =>
          requirementAnalyses.find(
            item =>
              (!where.id || item.id === where.id) &&
              (!where.qualityPlanRevisionId || item.qualityPlanRevisionId === where.qualityPlanRevisionId),
          ) ?? null,
      ),
      create: vi.fn(async ({ data }: FakeWriteArgs) => {
        const analysis: FakeRequirementAnalysis = {
          id: nextId('analysis'),
          qualityPlanRevisionId: 'revision-0',
          revision: 1,
          ...data,
        }
        requirementAnalyses.push(analysis)
        return analysis
      }),
      update: vi.fn(async ({ where, data }: FakeUpdateArgs<{ id: string }>) => {
        const analysis = requirementAnalyses.find(item => item.id === where.id)
        if (!analysis) throw new Error(`Missing fake requirement analysis ${where.id}`)
        Object.assign(analysis, data)
        return analysis
      }),
    },
    validationDesignRevision: {
      findFirst: vi.fn(
        async ({ where }: FakeWhereArgs) =>
          validationDesigns.find(
            item =>
              (!where.id || item.id === where.id) &&
              (!where.qualityPlanRevisionId || item.qualityPlanRevisionId === where.qualityPlanRevisionId) &&
              (!where.designHash || item.designHash === where.designHash),
          ) ?? null,
      ),
      findMany: vi.fn(async ({ where }: FakeWhereArgs) =>
        validationDesigns.filter(
          item => !where.qualityPlanRevisionId || item.qualityPlanRevisionId === where.qualityPlanRevisionId,
        ),
      ),
      create: vi.fn(async ({ data }: FakeWriteArgs) => {
        const design: FakeValidationDesign = {
          id: nextId('validation-design'),
          qualityPlanRevisionId: 'revision-0',
          revision: 1,
          designHash: 'sha256:uninitialized',
          ...data,
        }
        validationDesigns.push(design)
        return design
      }),
      update: vi.fn(async ({ where, data }: FakeUpdateArgs<{ id: string }>) => {
        const design = validationDesigns.find(item => item.id === where.id)
        if (!design) throw new Error(`Missing fake validation design ${where.id}`)
        Object.assign(design, data)
        return design
      }),
    },
    requirementQuery: {
      findFirst: vi.fn(
        async ({ where }: FakeWhereArgs) => queries.find(item => !where.id || item.id === where.id) ?? null,
      ),
      create: vi.fn(async ({ data }: FakeWriteArgs) => {
        const query: FakeQuery = {
          id: nextId('query'),
          qualityPlanRevisionId: 'revision-0',
          prompt: '',
          status: 'BLOCKING',
          answer: null,
          rationale: null,
          ...data,
        }
        queries.push(query)
        return query
      }),
      update: vi.fn(async ({ where, data }: FakeUpdateArgs<{ id: string }>) => {
        const query = queries.find(item => item.id === where.id)
        if (!query) throw new Error(`Missing fake query ${where.id}`)
        Object.assign(query, data)
        return query
      }),
    },
    validationVersion: {
      findFirst: vi.fn(async ({ where }: FakeWhereArgs) => {
        return (
          validationVersions.find(
            item =>
              (!where.qualityPlanRevisionId || item.qualityPlanRevisionId === where.qualityPlanRevisionId) &&
              (!where.canonicalHash || item.canonicalHash === where.canonicalHash) &&
              (!where.id || item.id === where.id),
          ) ?? null
        )
      }),
      create: vi.fn(async ({ data }: FakeWriteArgs) => {
        const version: FakeValidationVersion = {
          id: nextId('validation'),
          qualityPlanRevisionId: 'revision-0',
          validationDesignRevisionId: 'validation-design-0',
          validationIdentity: 'validation-identity-0',
          version: 1,
          status: 'DRAFT',
          reuseOutcome: null,
          canonicalAstJson: '{}',
          canonicalHash: 'sha256:uninitialized',
          ...data,
        }
        validationVersions.push(version)
        return version
      }),
      update: vi.fn(async ({ where, data }: FakeUpdateArgs<{ id: string }>) => {
        const version = validationVersions.find(item => item.id === where.id)
        if (!version) throw new Error(`Missing fake validation version ${where.id}`)
        Object.assign(version, data)
        return version
      }),
    },
    obligationValidationVersion: {
      findFirst: vi.fn(),
      create: vi.fn(async ({ data }: FakeWriteArgs) => {
        const link = { id: nextId('obligation-link'), ...data }
        obligationLinks.push(link)
        return link
      }),
      update: vi.fn(),
    },
    evaluationSubjectRevision: {
      findFirst: vi.fn(
        async ({ where }: FakeWhereArgs<{ subjectDigest: string }>) =>
          subjects.find(item => item.subjectDigest === where.subjectDigest) ?? null,
      ),
      create: vi.fn(async ({ data }: FakeWriteArgs) => {
        const subject: FakeEvaluationSubject = {
          id: nextId('subject'),
          subjectDigest: 'sha256:subject-0',
          subjectKind: 'ARTIFACT',
          authority: 'test',
          metadataJson: null,
          ...data,
        }
        subjects.push(subject)
        return subject
      }),
      update: vi.fn(),
    },
    assessment: {
      findMany: vi.fn(async ({ where }: FakeWhereArgs) =>
        assessments
          .filter(assessment => !where.targetProjectId || assessment.targetProjectId === where.targetProjectId)
          .map(hydrateAssessment),
      ),
      findFirst: vi.fn(async ({ where }: FakeWhereArgs) => {
        const assessment = assessments.find(item => matchesAssessmentWhere(item, where))
        return assessment ? hydrateAssessment(assessment) : null
      }),
      create: vi.fn(async ({ data }: FakeWriteArgs) => {
        if (
          assessments.some(
            current =>
              (data.supersedesAssessmentId && current.supersedesAssessmentId === data.supersedesAssessmentId) ||
              (data.successorIdempotencyKey &&
                current.targetProjectId === data.targetProjectId &&
                current.successorIdempotencyKey === data.successorIdempotencyKey) ||
              (data.lineageId &&
                data.generation !== undefined &&
                current.lineageId === data.lineageId &&
                current.generation === data.generation),
          )
        ) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
        }
        const assessment: FakeAssessment = {
          id: nextId('assessment'),
          targetProjectId: 'target-1',
          qualityPlanId: 'quality-plan-0',
          qualityPlanRevisionId: 'revision-0',
          evaluationSubjectRevisionId: 'subject-0',
          status: 'CREATED',
          alignment: 'CURRENT',
          observedAssurance: null,
          baselineAssessmentId: null,
          lineageId: '',
          generation: 0,
          supersedesAssessmentId: null,
          supersessionDispositionJson: null,
          successorIdempotencyKey: null,
          successorRequestHash: null,
          evidenceReceipts: [],
          findings: [],
          targetProjectKind: 'LOCAL_WORKSPACE',
          runs: [],
          ...data,
        }
        assessments.push(assessment)
        return hydrateAssessment(assessment)
      }),
      update: vi.fn(async ({ where, data }: FakeUpdateArgs<{ id: string }>) => {
        const assessment = assessments.find(item => item.id === where.id)
        if (!assessment) throw new Error(`Missing fake assessment ${where.id}`)
        Object.assign(assessment, data)
        return hydrateAssessment(assessment)
      }),
    },
    assessmentDecision: {
      findFirst: vi.fn(),
      create: vi.fn(async ({ data }: FakeWriteArgs) => {
        const decision: FakeAssessmentDecision = {
          id: nextId('decision'),
          assessmentId: 'assessment-0',
          decision: 'ACCEPTED',
          rationale: '',
          decidedBy: 'reviewer',
          decidedAt: new Date(),
          decisionHash: 'sha256:uninitialized',
          ...data,
        }
        decisions.push(decision)
        return decision
      }),
      update: vi.fn(),
    },
    assessmentFinding: {
      findFirst: vi.fn(),
      create: vi.fn(async ({ data }: FakeWriteArgs) => {
        const assessment = assessments.find(item => item.id === data.assessmentId)
        if (!assessment) throw new Error(`Missing fake assessment ${String(data.assessmentId)}`)
        const finding: FakeAssessmentFinding = {
          id: nextId('finding'),
          assessmentId: assessment.id,
          qualityObligationRevisionId: 'obligation-0',
          outcome: 'SATISFIED',
          attribution: 'NOT_APPLICABLE',
          evidenceSetHash: 'sha256:uninitialized',
          findingHash: 'sha256:uninitialized',
          reviewStatus: 'PENDING',
          reviewHash: null,
          ...data,
        }
        assessment.findings = [...(assessment.findings ?? []), finding]
        return finding
      }),
      update: vi.fn(async ({ where, data }: FakeUpdateArgs<{ id: string }>) => {
        for (const assessment of assessments) {
          const finding = assessment.findings?.find(item => item.id === where.id)
          if (finding) {
            Object.assign(finding, data)
            return finding
          }
        }
        throw new Error(`Missing fake assessment finding ${where.id}`)
      }),
    },
    async $transaction<T>(operation: ((transaction: QualityDesignClient) => Promise<T>) | Promise<T>[]): Promise<T> {
      return typeof operation === 'function'
        ? // The in-memory delegate intentionally implements the service-facing
          // subset only; this is the single mock boundary for PrismaLike.
          operation(fake as unknown as QualityDesignClient)
        : Promise.all(operation).then(values => values[0]!)
    },
  }
  function hydrateAssessment(assessment: FakeAssessment) {
    const revision = revisions.find(item => item.id === assessment.qualityPlanRevisionId)
    if (!revision) throw new Error(`Missing fake revision ${String(assessment.qualityPlanRevisionId)}`)
    const qualityPlan = plans.find(plan => plan.id === assessment.qualityPlanId)
    if (!qualityPlan) throw new Error(`Missing fake Quality Plan ${assessment.qualityPlanId}`)
    const evaluationSubjectRevision = subjects.find(subject => subject.id === assessment.evaluationSubjectRevisionId)
    if (!evaluationSubjectRevision) {
      throw new Error(`Missing fake evaluation subject ${assessment.evaluationSubjectRevisionId}`)
    }
    return {
      ...assessment,
      qualityPlan,
      qualityPlanRevision: hydrate(revision),
      evaluationSubjectRevision,
      targetProject: { kind: assessment.targetProjectKind ?? 'LOCAL_WORKSPACE' },
      evidenceReceipts: assessment.evidenceReceipts ?? [],
      findings: assessment.findings ?? [],
      decisions: decisions.filter(decision => decision.assessmentId === assessment.id),
      runs: assessment.runs ?? [],
    }
  }
  return fake as unknown as QualityDesignClient
}
