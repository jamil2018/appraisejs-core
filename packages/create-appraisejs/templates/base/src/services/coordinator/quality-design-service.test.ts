import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  answerQualityRequirementQueries,
  approveQualityRequirements,
  createQualityAssessment,
  createQualityAssessmentSuccessor,
  listQualityAssessments,
  listQualityPlans,
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
  findings: Array<{
    id: string
    qualityObligationRevisionId: string
    outcome: string
    attribution: string
    evidenceSetHash: string
    findingHash: string
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

describe('quality design coordinator service', () => {
  let client: ReturnType<typeof createWorkingFakeClient>

  beforeEach(() => {
    client = createWorkingFakeClient()
  })

  it('creates a Quality Plan revision with snapshots but no obligations before analysis approval', async () => {
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
    expect(result.obligations).toHaveLength(0)
    expect(result.approval).toEqual({ blocked: false })
    expect(result.revision.contentHash).toMatch(/^sha256:/)

    await expect(readQualityRequirementGraph({ qualityPlanId: result.qualityPlan.id }, client)).resolves.toMatchObject({
      revision: { id: result.revision.id, contentHash: result.revision.contentHash },
      nextRecommendedAction: expect.stringContaining('requirement_analysis_propose'),
    })
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

  it('creates one idempotent successor when an approved requirement answer changes', async () => {
    const draft = await submitQualityRequirementSource(
      { target: 'target-1', idempotencyKey: 'successor-source', source: { title: 'Clarified plan' } },
      client,
    )
    const queryId = draft.queries[0]!.id
    await answerQualityRequirementQueries(
      {
        qualityPlanId: draft.qualityPlan.id,
        revisionId: draft.revision.id,
        idempotencyKey: 'draft-answer',
        answers: [{ queryId, status: 'ANSWERED', answer: 'Exports include selected rows.' }],
      },
      client,
    )
    await approveQualityRequirements(
      {
        qualityPlanId: draft.qualityPlan.id,
        revisionId: draft.revision.id,
        expectedRevisionHash: draft.revision.contentHash,
        approvedBy: 'reviewer',
      },
      client,
    )
    const command = {
      qualityPlanId: draft.qualityPlan.id,
      revisionId: draft.revision.id,
      idempotencyKey: 'approved-answer-successor',
      answers: [{ queryId, status: 'ACCEPTED_ASSUMPTION' as const, rationale: 'Approved clarification.' }],
    }
    const successor = await answerQualityRequirementQueries(command, client)
    expect(successor).toMatchObject({
      idempotent: false,
      predecessorRevisionId: draft.revision.id,
      revision: { revision: 2 },
    })
    await expect(answerQualityRequirementQueries(command, client)).resolves.toMatchObject({
      idempotent: true,
      revision: { id: successor.revision.id },
    })
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
})

function createWorkingFakeClient() {
  const revisions: FakeRevision[] = []
  const plans: FakeQualityPlan[] = []
  const requirements: FakeRequirementSnapshot[] = []
  const obligations: FakeObligation[] = []
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
        const found = revisions.find(revision =>
          Object.entries(where).every(([field, value]) => !value || revision[field as keyof typeof revision] === value),
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
    async $transaction<T>(operation: ((transaction: QualityDesignClient) => Promise<T>) | Promise<T>[]): Promise<T> {
      return typeof operation === 'function'
        ? operation(fake as QualityDesignClient)
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
      evidenceReceipts: assessment.evidenceReceipts ?? [],
      findings: assessment.findings ?? [],
      decisions: decisions.filter(decision => decision.assessmentId === assessment.id),
    }
  }
  return fake
}
