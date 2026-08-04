import { beforeEach, describe, expect, it, vi } from 'vitest'

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  answerQualityRequirementQueries,
  approveQualityRequirements,
  approveQualityValidationDesign,
  compileQualityValidations,
  createQualityAssessment,
  decideQualityAssessment,
  publishQualityValidations,
  proposeQualityValidationDesign,
  readQualityAssessment,
  readQualityRequirementGraph,
  submitQualityRequirementSource,
} from './quality-design-service'

vi.mock('@/services/target-project/target-project-service', () => ({
  resolveTargetProject: vi.fn(async () => ({
    id: 'target-1',
    fingerprint: 'sha256:target',
    canonicalPath: '/tmp/target',
  })),
}))

describe('quality design coordinator service', () => {
  let client: ReturnType<typeof createWorkingFakeClient>

  beforeEach(() => {
    client = createWorkingFakeClient()
  })

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

    await expect(readQualityRequirementGraph({ qualityPlanId: result.qualityPlan.id }, client)).resolves.toMatchObject({
      revision: { id: result.revision.id, contentHash: result.revision.contentHash },
    })
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
          default: {
            stepInvocations: [{ stepId: 'step-checkout', stepVersion: '1.0.0', params: { expected: 'receipt' } }],
            environmentRefs: ['env-local'],
          },
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
    expect(assessment.evidenceReceiptCount).toBe(0)

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
      data: { status: 'READY', evidenceReceipts: [{ receiptHash: 'sha256:evidence-1' }] },
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

    await client.assessment.update({ where: { id: assessment.assessment.id }, data: { status: 'EVIDENCE_REVIEW' } })
    const reviewed = await readQualityAssessment(assessment.assessment.id, client)
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
        realization: { default: { stepInvocations: [] } },
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

function createWorkingFakeClient() {
  const revisions: any[] = []
  const plans: any[] = []
  const requirements: any[] = []
  const obligations: any[] = []
  const queries: any[] = []
  const validationVersions: any[] = []
  const obligationLinks: any[] = []
  const subjects: any[] = []
  const assessments: any[] = []
  const decisions: any[] = []
  let id = 0
  const nextId = (prefix: string) => `${prefix}-${++id}`
  const hydrate = (revision: any) => ({
    ...revision,
    qualityPlan: plans.find(plan => plan.id === revision.qualityPlanId),
    requirementSnapshots: requirements.filter(item => item.qualityPlanRevisionId === revision.id),
    obligations: obligations.filter(item => item.qualityPlanRevisionId === revision.id),
    queries: queries.filter(item => item.qualityPlanRevisionId === revision.id),
    validationVersions: validationVersions.filter(item => item.qualityPlanRevisionId === revision.id),
  })
  const fake = {
    qualityPlanRevision: {
      findFirst: vi.fn(async ({ where }: any) => {
        const found = revisions.find(
          revision =>
            (!where.qualityPlanId || revision.qualityPlanId === where.qualityPlanId) &&
            (!where.targetProjectId || revision.targetProjectId === where.targetProjectId) &&
            (!where.contentHash || revision.contentHash === where.contentHash) &&
            (!where.id || revision.id === where.id),
        )
        return found ? hydrate(found) : null
      }),
      create: vi.fn(async ({ data }: any) => {
        const revision = { id: nextId('revision'), status: 'DRAFT', approvedAt: null, ...data }
        revisions.push(revision)
        return revision
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const revision = revisions.find(item => item.id === where.id)
        Object.assign(revision, data)
        return hydrate(revision)
      }),
    },
    qualityPlan: {
      create: vi.fn(async ({ data }: any) => {
        const plan = { id: nextId('quality-plan'), description: null, ...data }
        plans.push(plan)
        return plan
      }),
    },
    requirementSnapshot: {
      create: vi.fn(async ({ data }: any) => {
        const snapshot = { id: nextId('requirement'), ...data }
        requirements.push(snapshot)
        return snapshot
      }),
    },
    qualityObligationRevision: {
      create: vi.fn(async ({ data }: any) => {
        const obligation = { id: nextId('obligation'), ...data }
        obligations.push(obligation)
        return obligation
      }),
    },
    requirementQuery: {
      create: vi.fn(async ({ data }: any) => {
        const query = { id: nextId('query'), answer: null, rationale: null, ...data }
        queries.push(query)
        return query
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const query = queries.find(item => item.id === where.id)
        Object.assign(query, data)
        return query
      }),
    },
    validationVersion: {
      findFirst: vi.fn(async ({ where }: any) => {
        return (
          validationVersions.find(
            item =>
              (!where.qualityPlanRevisionId || item.qualityPlanRevisionId === where.qualityPlanRevisionId) &&
              (!where.canonicalHash || item.canonicalHash === where.canonicalHash) &&
              (!where.id || item.id === where.id),
          ) ?? null
        )
      }),
      create: vi.fn(async ({ data }: any) => {
        const version = { id: nextId('validation'), reuseOutcome: null, ...data }
        validationVersions.push(version)
        return version
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const version = validationVersions.find(item => item.id === where.id)
        Object.assign(version, data)
        return version
      }),
    },
    obligationValidationVersion: {
      create: vi.fn(async ({ data }: any) => {
        const link = { id: nextId('obligation-link'), ...data }
        obligationLinks.push(link)
        return link
      }),
    },
    evaluationSubjectRevision: {
      findFirst: vi.fn(
        async ({ where }: any) => subjects.find(item => item.subjectDigest === where.subjectDigest) ?? null,
      ),
      create: vi.fn(async ({ data }: any) => {
        const subject = { id: nextId('subject'), metadataJson: null, ...data }
        subjects.push(subject)
        return subject
      }),
      update: vi.fn(),
    },
    assessment: {
      findFirst: vi.fn(async ({ where }: any) => {
        const assessment = assessments.find(
          item =>
            (!where.id || item.id === where.id) &&
            (!where.targetProjectId || item.targetProjectId === where.targetProjectId) &&
            (!where.qualityPlanRevisionId || item.qualityPlanRevisionId === where.qualityPlanRevisionId) &&
            (!where.evaluationSubjectRevisionId ||
              item.evaluationSubjectRevisionId === where.evaluationSubjectRevisionId),
        )
        return assessment ? hydrateAssessment(assessment) : null
      }),
      create: vi.fn(async ({ data }: any) => {
        const assessment = {
          id: nextId('assessment'),
          status: 'CREATED',
          alignment: 'CURRENT',
          observedAssurance: null,
          evidenceReceipts: [],
          ...data,
        }
        assessments.push(assessment)
        return hydrateAssessment(assessment)
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const assessment = assessments.find(item => item.id === where.id)
        Object.assign(assessment, data)
        return hydrateAssessment(assessment)
      }),
    },
    assessmentDecision: {
      findFirst: vi.fn(),
      create: vi.fn(async ({ data }: any) => {
        const decision = { id: nextId('decision'), decidedAt: new Date(), ...data }
        decisions.push(decision)
        return decision
      }),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (operation: any) =>
      typeof operation === 'function' ? operation(fake) : Promise.all(operation),
    ),
  }
  function hydrateAssessment(assessment: any) {
    return {
      ...assessment,
      qualityPlan: plans.find(plan => plan.id === assessment.qualityPlanId),
      qualityPlanRevision: hydrate(revisions.find(revision => revision.id === assessment.qualityPlanRevisionId)),
      evaluationSubjectRevision: subjects.find(subject => subject.id === assessment.evaluationSubjectRevisionId),
      evidenceReceipts: assessment.evidenceReceipts ?? [],
      decisions: decisions.filter(decision => decision.assessmentId === assessment.id),
    }
  }
  return fake as any
}
