import { describe, expect, it } from 'vitest'

import { builtInMethodologyRef } from '@/lib/quality-design/methodology-registry'

import {
  approvedValidationState,
  consentPolicy,
  listQualityMethodologies,
  obligationSetHash,
  proposeRequirementAnalysis,
  proposeValidationDesign,
  requirementAnalysisHash,
  validationDesignHash,
  type PrismaLike,
} from './quality-operating-system-service'

const revision = {
  id: 'revision-1',
  targetProjectId: 'target-1',
  qualityPlanId: 'plan-1',
  status: 'DRAFT',
  requirementSnapshots: [{ id: 'requirement-1', text: 'Export reports.' }],
  queries: [],
  obligations: [],
}

const validProposal = {
  schemaVersion: '1' as const,
  methodology: builtInMethodologyRef,
  requirements: [{ id: 'requirement-1', text: 'Export reports.' }],
  inferences: [],
  assumptions: [],
  ambiguities: [],
  contradictions: [],
  proposedQueries: [],
  obligations: [
    {
      id: 'obligation-export',
      requirementIds: ['requirement-1'],
      intent: 'The exported report contains every selected row.',
      minimumAssurance: 'HIGH' as const,
      provenance: { sourceRequirementIds: ['requirement-1'], rationale: 'The source requirement states export.' },
    },
  ],
}

function proposalClient(): PrismaLike {
  return {
    qualityPlanRevision: {
      findFirst: async () => revision,
      findMany: async () => [],
      create: async () => revision,
      update: async () => revision,
    },
    requirementAnalysisRevision: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }: { data: { critiqueJson?: string } }) => ({
        id: 'analysis-1',
        ...data,
        critiqueJson: data.critiqueJson ?? null,
        decisionRationale: null,
        decidedBy: null,
        decidedAt: null,
        approvedAt: null,
        approvedBy: null,
        approvalHash: null,
      }),
      update: async () => {
        throw new Error('not used')
      },
    },
    requirementQuery: noOpDelegate(),
    qualityObligationRevision: noOpDelegate(),
    validationDesignRevision: noOpDelegate(),
    validationVersion: noOpDelegate(),
    obligationValidationVersion: noOpDelegate(),
    assessment: noOpDelegate(),
    environment: noOpDelegate(),
    executionConsent: noOpDelegate(),
    evidenceReceipt: noOpDelegate(),
    assessmentFinding: noOpDelegate(),
    assessmentFindingEvidenceReceipt: noOpDelegate(),
    $transaction: async (operation: (transaction: PrismaLike) => Promise<unknown>) => operation(proposalClient()),
  } as unknown as PrismaLike
}

function noOpDelegate() {
  return {
    findFirst: async () => null,
    findMany: async () => [],
    create: async () => ({ id: 'unused' }),
    update: async () => ({ id: 'unused' }),
  }
}

describe('Quality Operating System service', () => {
  it('publishes the installed methodology and hashes exact immutable planning inputs', () => {
    expect(listQualityMethodologies()).toHaveLength(1)
    expect(requirementAnalysisHash(validProposal)).toBe(requirementAnalysisHash(validProposal))
    const obligations = [{ id: 'obligation-1', minimumAssurance: 'HIGH' }]
    const design = {
      schemaVersion: '1' as const,
      methodology: builtInMethodologyRef,
      requiredAssurance: 'HIGH' as const,
      techniques: ['negative testing'],
      layers: ['browser'],
      risks: ['incomplete export'],
      evidenceExpectations: ['sealed report evidence'],
      limitations: [],
      scenarios: [
        {
          id: 'scenario-1',
          title: 'Export reports',
          obligationIds: ['obligation-1'],
          behavior: 'Export a selected report.',
          kind: 'NEGATIVE' as const,
          assertions: [{ id: 'assertion-1', statement: 'An error is visible.', observable: true }],
          requiredMinimumAssurance: 'HIGH' as const,
          matrix: { cells: [{ browser: 'chromium', environment: 'local' }], rationale: 'Primary supported browser.' },
          failureMeaning: 'The report export is not reliable.',
        },
      ],
    }
    const obligationHash = obligationSetHash(obligations)
    expect(validationDesignHash(design, 'sha256:a'.padEnd(71, 'a'), obligationHash)).toBe(
      validationDesignHash(design, 'sha256:a'.padEnd(71, 'a'), obligationHash),
    )
  })

  it('rejects synthetic legacy analysis as authority for a new canonical design', async () => {
    const client = proposalClient()
    client.requirementAnalysisRevision.findFirst = async () =>
      ({
        id: 'legacy-analysis:revision-1',
        targetProjectId: 'target-1',
        qualityPlanRevisionId: 'revision-1',
        decision: 'APPROVED',
        analysisHash: 'sha256:legacy',
      }) as never
    await expect(
      proposeValidationDesign(
        {
          targetProjectId: 'target-1',
          qualityPlanRevisionId: 'revision-1',
          requirementAnalysisRevisionId: 'legacy-analysis:revision-1',
          expectedAnalysisHash: 'sha256:legacy',
          expectedObligationSetHash: obligationSetHash([]),
          proposal: {
            schemaVersion: '1',
            methodology: builtInMethodologyRef,
            requiredAssurance: 'STANDARD',
            techniques: ['boundary'],
            layers: ['browser'],
            risks: ['missing export'],
            evidenceExpectations: ['sealed evidence'],
            limitations: [],
            scenarios: [
              {
                id: 'scenario',
                title: 'Export',
                obligationIds: ['obligation'],
                behavior: 'Export reports',
                kind: 'POSITIVE',
                assertions: [{ id: 'assertion', statement: 'Report is visible', observable: true }],
                requiredMinimumAssurance: 'STANDARD',
                matrix: { cells: [{ browser: 'chromium', environment: 'local' }], rationale: 'Supported browser' },
                failureMeaning: 'Export failed',
              },
            ],
          },
        },
        client,
      ),
    ).rejects.toThrow('Legacy projected analysis is read-only')
  })

  it('materializes an approved design in the exact state and hash consumed by validation compilation', () => {
    const approvedAt = new Date('2026-08-22T00:00:00.000Z')
    expect(approvedValidationState('sha256:approved-design', 'reviewer', approvedAt)).toEqual({
      status: 'SCENARIO_APPROVED',
      scenarioApprovedAt: approvedAt,
      scenarioApprovedBy: 'reviewer',
      scenarioApprovalHash: 'sha256:approved-design',
    })
  })

  it('rejects analysis that does not use exact RequirementSnapshot identities', async () => {
    const client = proposalClient()
    await expect(
      proposeRequirementAnalysis(
        {
          targetProjectId: 'target-1',
          qualityPlanRevisionId: 'revision-1',
          proposal: { ...validProposal, requirements: [{ id: 'stale-requirement', text: 'Export reports.' }] },
        },
        client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('stores critique-visible analysis proposals while keeping blockers for the approval gate', async () => {
    const result = await proposeRequirementAnalysis(
      { targetProjectId: 'target-1', qualityPlanRevisionId: 'revision-1', proposal: validProposal },
      proposalClient(),
    )
    expect(result.idempotent).toBe(false)
    expect(result.analysis.analysisHash).toBe(requirementAnalysisHash(validProposal))
    expect(result.analysis.critique).toEqual([])
  })

  it('never lowers project consent and always hard-gates credentials or material effects', () => {
    expect(() =>
      consentPolicy({
        projectMode: 'ALWAYS_ASK',
        requestedMode: 'TRUSTED_AGENT',
        credentialRequired: false,
        materialEffects: [],
      }),
    ).toThrow('cannot lower')
    expect(
      consentPolicy({ projectMode: 'TRUSTED_AGENT', credentialRequired: true, materialEffects: [] }),
    ).toMatchObject({ explicitConsentRequired: true, hardGate: true })
    expect(
      consentPolicy({ projectMode: 'TRUSTED_AGENT', credentialRequired: false, materialEffects: ['purchase'] }),
    ).toMatchObject({ explicitConsentRequired: true, hardGate: true })
    expect(
      consentPolicy({
        projectMode: 'RISK_AWARE',
        credentialRequired: false,
        materialEffects: [],
        riskClassification: 'REVERSIBLE_WRITE',
      }),
    ).toMatchObject({ explicitConsentRequired: true, hardGate: false })
    expect(
      consentPolicy({
        projectMode: 'TRUSTED_AGENT',
        credentialRequired: false,
        materialEffects: [],
        riskClassification: 'REVERSIBLE_WRITE',
      }),
    ).toMatchObject({ explicitConsentRequired: false, hardGate: false })
  })
})
