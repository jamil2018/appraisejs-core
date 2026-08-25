import { describe, expect, it } from 'vitest'

import {
  builtInMethodologyManifest,
  builtInMethodologyProvider,
  builtInMethodologyRef,
  critiqueRequirementAnalysis,
  critiqueValidationDesign,
  evaluateQualityPlanning,
  evidenceAttributionSchema,
  methodologyManifestDigest,
  obligationFindingSchema,
  requirementAnalysisProposalSchema,
  validationDesignProposalSchema,
} from './methodology-registry'

const digest = (character: string) => `sha256:${character.repeat(64)}`

describe('Quality OS methodology registry', () => {
  it('publishes the complete stable built-in methodology reference through its provider seam', () => {
    expect(builtInMethodologyRef.digest).toBe(methodologyManifestDigest(builtInMethodologyManifest))
    expect(builtInMethodologyProvider.read(builtInMethodologyRef)).toEqual(builtInMethodologyManifest)
    expect(builtInMethodologyProvider.read({ ...builtInMethodologyRef, version: '9.0.0' })).toBeNull()
    expect(builtInMethodologyManifest.methods.map(method => method.id)).toEqual(
      expect.arrayContaining([
        'requirement-decomposition',
        'ambiguity-analysis',
        'risk-discovery',
        'quality-attributes',
        'state-transitions',
        'boundary-and-equivalence',
        'negative-and-recovery',
        'accessibility',
        'security',
        'data-integrity',
        'reliability',
        'compatibility',
        'performance',
      ]),
    )
  })

  it('strictly validates proposals and permits only attributed target defects to violate obligations', () => {
    const analysis = requirementAnalysisProposalSchema.parse({
      schemaVersion: '1',
      methodology: builtInMethodologyRef,
      requirements: [{ id: 'requirement-1', text: 'Export the report.' }],
      inferences: [],
      assumptions: [],
      ambiguities: [],
      contradictions: [],
      proposedQueries: [],
      obligations: [
        {
          id: 'obligation-1',
          requirementIds: ['requirement-1'],
          intent: 'The exported report is complete.',
          minimumAssurance: 'HIGH',
          provenance: { sourceRequirementIds: ['requirement-1'], rationale: 'Directly stated.' },
        },
      ],
    })
    expect(critiqueRequirementAnalysis(analysis)).toEqual([])
    expect(() => requirementAnalysisProposalSchema.parse({ ...analysis, unexpected: true })).toThrow()
    const incompleteAnalysis = requirementAnalysisProposalSchema.parse({
      ...analysis,
      inferences: [
        {
          id: 'inference-1',
          statement: 'Exports are retained indefinitely.',
          confidence: 'LOW',
          provenance: { sourceRequirementIds: [], rationale: '' },
        },
      ],
    })
    expect(critiqueRequirementAnalysis(incompleteAnalysis)).toEqual([
      {
        code: 'MISSING_PROVENANCE',
        subjectId: 'inference-1',
        message: 'Inference requires requirement provenance.',
      },
    ])

    const attribution = evidenceAttributionSchema.parse({
      schemaVersion: '1',
      kind: 'target_defect',
      supportingEvidenceHashes: [digest('a')],
      contradictingEvidenceHashes: [],
      validationRechecked: true,
      requirementAlignmentConfirmed: true,
      confidence: 'HIGH',
      rationale: 'The sealed evidence shows an incomplete export.',
    })
    expect(
      obligationFindingSchema.parse({
        schemaVersion: '1',
        obligationId: 'obligation-1',
        outcome: 'VIOLATED',
        attribution,
      }),
    ).toMatchObject({ outcome: 'VIOLATED' })
    expect(() =>
      obligationFindingSchema.parse({
        schemaVersion: '1',
        obligationId: 'obligation-1',
        outcome: 'VIOLATED',
        attribution: { ...attribution, kind: 'validation_design_defect' },
      }),
    ).toThrow()
  })

  it('reports deterministic critique findings for planning weaknesses', () => {
    const design = validationDesignProposalSchema.parse({
      schemaVersion: '1',
      methodology: builtInMethodologyRef,
      requiredAssurance: 'HIGH',
      techniques: ['boundary analysis', 'negative testing'],
      layers: ['browser'],
      risks: ['incomplete report export'],
      evidenceExpectations: ['sealed report contents and execution receipt'],
      limitations: [],
      scenarios: [
        {
          id: 'scenario-1',
          title: 'Export succeeds',
          obligationIds: ['obligation-1'],
          behavior: 'Export a report.',
          kind: 'POSITIVE',
          assertions: [{ id: 'assertion-1', statement: 'The report looks correct.', observable: false }],
          requiredMinimumAssurance: 'SMOKE',
          matrix: { cells: [{ browser: 'chromium', environment: 'local' }], rationale: '' },
          failureMeaning: '',
        },
        {
          id: 'scenario-2',
          title: 'Duplicate export succeeds',
          obligationIds: ['obligation-1'],
          behavior: 'Export a report.',
          kind: 'POSITIVE',
          assertions: [{ id: 'assertion-2', statement: 'The report looks correct.', observable: true }],
          requiredMinimumAssurance: 'HIGH',
          matrix: { cells: [{ browser: 'chromium', environment: 'local' }], rationale: 'Local browser coverage.' },
          failureMeaning: 'The export is incomplete.',
        },
      ],
    })

    expect(critiqueValidationDesign(design, ['obligation-1', 'obligation-2']).map(finding => finding.code)).toEqual([
      'UNCOVERED_OBLIGATION',
      'HAPPY_PATH_ONLY',
      'NON_FALSIFIABLE_ASSERTION',
      'UNJUSTIFIED_MATRIX',
      'ASSURANCE_DOWNGRADE',
      'MISSING_FAILURE_MEANING',
      'DUPLICATE_SCENARIO',
    ])
  })

  it.each([
    [
      'ambiguous',
      {
        requirement: 'The search response must complete within 200 milliseconds.',
        obligation: 'Search latency stays within the approved milliseconds threshold.',
        risks: ['search latency exceeds the milliseconds threshold', 'slow response under boundary load'],
        techniques: ['latency measurement', 'boundary load analysis'],
        positiveBehavior: 'Measure search latency below the milliseconds threshold.',
        negativeBehavior: 'Exercise search latency at the boundary load.',
        ambiguities: ['The phrase quickly has no threshold.'],
        proposedQueries: [
          {
            id: 'speed',
            prompt: 'What response threshold is required?',
            rationale: 'A measurable oracle is required.',
          },
        ],
      },
    ],
    [
      'contradictory',
      {
        requirement: 'Checkout authentication must follow the resolved access rule.',
        obligation: 'Checkout authentication enforces the authoritative access rule.',
        risks: ['incorrect checkout authentication', 'conflicting access enforcement'],
        techniques: ['authentication decision testing', 'access-rule analysis'],
        positiveBehavior: 'Use valid checkout authentication.',
        negativeBehavior: 'Reject checkout authentication that violates the access rule.',
        contradictions: ['The source requires both anonymous and authenticated checkout.'],
        proposedQueries: [
          {
            id: 'auth',
            prompt: 'Which checkout authentication rule is authoritative?',
            rationale: 'Resolve contradictory access behavior.',
          },
        ],
      },
    ],
    [
      'stateful',
      {
        requirement: 'An active account can transition to suspended and recover to active.',
        obligation: 'Account state transitions preserve the suspended and active lifecycle.',
        risks: ['invalid account state transition', 'failed suspended-state recovery'],
        techniques: ['state-transition testing', 'recovery testing'],
        positiveBehavior: 'Transition the account from active to suspended.',
        negativeBehavior: 'Reject an invalid account state transition and recover.',
        assumptions: ['The account begins in an active state.'],
      },
    ],
    [
      'security-sensitive',
      {
        requirement: 'Only authorized users may download the protected report.',
        obligation: 'Report authorization prevents unauthorized downloads.',
        risks: ['authorization bypass for report downloads', 'unauthorized report disclosure'],
        techniques: ['authorization testing', 'access-control boundary analysis'],
        positiveBehavior: 'Allow an authorized report download.',
        negativeBehavior: 'Reject an unauthorized report download.',
        assumptions: ['Authorization is enforced server-side.'],
      },
    ],
    [
      'accessibility-relevant',
      {
        requirement: 'Keyboard users can operate the dialog and retain visible focus.',
        obligation: 'Dialog keyboard operation preserves visible focus.',
        risks: ['keyboard focus becomes trapped', 'dialog focus is not visible'],
        techniques: ['keyboard accessibility testing', 'focus-order inspection'],
        positiveBehavior: 'Operate the dialog with the keyboard and observe focus.',
        negativeBehavior: 'Attempt to move keyboard focus outside the dialog.',
        assumptions: ['Keyboard operation is required.'],
      },
    ],
    [
      'data-sensitive',
      {
        requirement: 'Exported personal data remains complete and access-controlled.',
        obligation: 'Personal data export preserves completeness and access control.',
        risks: ['incomplete personal data export', 'personal data disclosure'],
        techniques: ['data-integrity comparison', 'export access-control testing'],
        positiveBehavior: 'Export complete personal data with valid access.',
        negativeBehavior: 'Reject a personal data export without valid access.',
        assumptions: ['Exported personal data must remain complete and access-controlled.'],
      },
    ],
  ])('accepts a complete %s planner fixture with explicit analysis dimensions', (_kind, dimensions) => {
    const { requirement, obligation, risks, techniques, positiveBehavior, negativeBehavior, ...analysisDimensions } =
      dimensions
    const analysis = requirementAnalysisProposalSchema.parse({
      schemaVersion: '1',
      methodology: builtInMethodologyRef,
      requirements: [{ id: 'requirement-1', text: requirement }],
      inferences: [],
      assumptions: [],
      ambiguities: [],
      contradictions: [],
      proposedQueries: [],
      obligations: [
        {
          id: 'obligation-1',
          requirementIds: ['requirement-1'],
          intent: obligation,
          minimumAssurance: 'HIGH',
          provenance: { sourceRequirementIds: ['requirement-1'], rationale: 'Direct requirement.' },
        },
      ],
      ...analysisDimensions,
    })
    expect(analysis).toMatchObject(analysisDimensions)
    const design = validationDesignProposalSchema.parse({
      schemaVersion: '1',
      methodology: builtInMethodologyRef,
      requiredAssurance: 'HIGH',
      techniques,
      layers: ['service', 'browser'],
      risks,
      evidenceExpectations: ['sealed request/response evidence', 'observable UI assertion evidence'],
      limitations: [],
      scenarios: [
        {
          id: 'positive',
          title: 'Expected behavior succeeds',
          obligationIds: ['obligation-1'],
          behavior: positiveBehavior,
          kind: 'POSITIVE',
          assertions: [{ id: 'positive-result', statement: 'The expected result is observable.', observable: true }],
          requiredMinimumAssurance: 'HIGH',
          matrix: { cells: [{ browser: 'chromium', environment: 'local' }], rationale: 'Primary supported runtime.' },
          failureMeaning: 'The expected product behavior is not satisfied.',
        },
        {
          id: 'negative',
          title: 'Invalid behavior is rejected',
          obligationIds: ['obligation-1'],
          behavior: negativeBehavior,
          kind: 'NEGATIVE',
          assertions: [{ id: 'negative-result', statement: 'A safe rejection is observable.', observable: true }],
          requiredMinimumAssurance: 'HIGH',
          matrix: { cells: [{ browser: 'chromium', environment: 'local' }], rationale: 'Primary supported runtime.' },
          failureMeaning: 'The product accepted behavior that should be rejected.',
        },
      ],
    })
    const attribution = evidenceAttributionSchema.parse({
      schemaVersion: '1',
      kind: 'target_defect',
      supportingEvidenceHashes: [digest('f')],
      contradictingEvidenceHashes: [],
      validationRechecked: true,
      requirementAlignmentConfirmed: true,
      confidence: 'HIGH',
      rationale: 'The sealed evidence isolates the target behavior.',
    })
    expect(evaluateQualityPlanning({ analysis, design, attribution, interactionTurns: 2 })).toMatchObject({
      passed: true,
      total: 20,
      improvementDimensions: [],
    })
  })

  it('rejects a structurally complete design that is irrelevant to its requirement semantics', () => {
    const analysis = requirementAnalysisProposalSchema.parse({
      schemaVersion: '1',
      methodology: builtInMethodologyRef,
      requirements: [{ id: 'requirement-1', text: 'Keyboard users can operate the dialog with visible focus.' }],
      inferences: [],
      assumptions: [],
      ambiguities: [],
      contradictions: [],
      proposedQueries: [],
      obligations: [
        {
          id: 'obligation-1',
          requirementIds: ['requirement-1'],
          intent: 'Dialog keyboard operation preserves visible focus.',
          minimumAssurance: 'HIGH',
          provenance: { sourceRequirementIds: ['requirement-1'], rationale: 'Direct accessibility requirement.' },
        },
      ],
    })
    const irrelevant = validationDesignProposalSchema.parse({
      schemaVersion: '1',
      methodology: builtInMethodologyRef,
      requiredAssurance: 'HIGH',
      techniques: ['SQL injection testing', 'token authorization testing'],
      layers: ['service', 'browser'],
      risks: ['SQL injection', 'expired authorization token'],
      evidenceExpectations: ['sealed security evidence'],
      limitations: [],
      scenarios: [
        {
          id: 'positive',
          title: 'Valid token accepted',
          obligationIds: ['obligation-1'],
          behavior: 'Open the dialog and submit a valid token.',
          kind: 'POSITIVE',
          assertions: [{ id: 'a1', statement: 'The token is accepted.', observable: true }],
          requiredMinimumAssurance: 'HIGH',
          matrix: { cells: [{ browser: 'chromium', environment: 'local' }], rationale: 'Supported runtime.' },
          failureMeaning: 'Valid authorization failed.',
        },
        {
          id: 'negative',
          title: 'Injection rejected',
          obligationIds: ['obligation-1'],
          behavior: 'Submit a SQL injection payload through the dialog.',
          kind: 'NEGATIVE',
          assertions: [{ id: 'a2', statement: 'The injection is rejected.', observable: true }],
          requiredMinimumAssurance: 'HIGH',
          matrix: { cells: [{ browser: 'chromium', environment: 'local' }], rationale: 'Supported runtime.' },
          failureMeaning: 'SQL injection was accepted.',
        },
      ],
    })
    const attribution = evidenceAttributionSchema.parse({
      schemaVersion: '1',
      kind: 'target_defect',
      supportingEvidenceHashes: [digest('e')],
      contradictingEvidenceHashes: [],
      validationRechecked: true,
      requirementAlignmentConfirmed: true,
      confidence: 'HIGH',
      rationale: 'Evidence reviewed.',
    })
    expect(evaluateQualityPlanning({ analysis, design: irrelevant, attribution, interactionTurns: 2 })).toMatchObject({
      passed: false,
      scores: { riskDiscovery: 0 },
    })

    const aligned = validationDesignProposalSchema.parse({
      ...irrelevant,
      techniques: ['keyboard accessibility testing', 'focus-order inspection'],
      risks: ['keyboard focus becomes trapped', 'dialog focus is not visible'],
      scenarios: irrelevant.scenarios.map((scenario, index) => ({
        ...scenario,
        title: index === 0 ? 'Keyboard focus is visible' : 'Keyboard focus cannot escape',
        behavior:
          index === 0
            ? 'Operate the dialog with the keyboard and observe focus.'
            : 'Move keyboard focus at the dialog boundary.',
        assertions: [
          { id: `focus-${index}`, statement: 'Keyboard focus remains visible in the dialog.', observable: true },
        ],
        failureMeaning: 'Dialog keyboard focus behavior is incorrect.',
      })),
    })
    const irrelevantQueryAnalysis = requirementAnalysisProposalSchema.parse({
      ...analysis,
      ambiguities: ['Keyboard focus order is undefined.'],
      proposedQueries: [
        { id: 'billing', prompt: 'Which billing currency is supported?', rationale: 'Clarify invoice totals.' },
      ],
    })
    expect(
      evaluateQualityPlanning({ analysis: irrelevantQueryAnalysis, design: aligned, attribution, interactionTurns: 2 }),
    ).toMatchObject({ passed: false, scores: { queryUsefulness: 0 } })
  })
})
