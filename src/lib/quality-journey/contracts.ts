import { z } from 'zod'

export const qualityJourneyContractVersion = 'appraise.quality-journey/v1' as const

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const nonEmptyText = z.string().trim().min(1).max(8_000)

export const qualityJourneyStageSchema = z.enum([
  'INTAKE',
  'ANALYSIS',
  'ANALYSIS_REVIEW',
  'DISCOVERY',
  'SCENARIO_DESIGN',
  'SCENARIO_REVIEW',
  'AUTOMATION',
  'EXECUTION',
  'TRIAGE',
  'REPORT_REVIEW',
  'CLOSED',
])
export type QualityJourneyStage = z.infer<typeof qualityJourneyStageSchema>

export const qualityJourneyRoleSchema = z.enum([
  'REQUIREMENT_ANALYZER',
  'SCOUT',
  'RESOURCE_EXPLORER',
  'TEST_SCENARIO_DESIGNER',
  'AUTOMATOR',
  'TRIAGER',
])
export type QualityJourneyRole = z.infer<typeof qualityJourneyRoleSchema>

const qualityJourneyArtifactKindSchema = z.enum([
  'JOURNEY_REVISION',
  'ANALYSIS_CHARTER_REVISION',
  'ANALYSIS_QUESTION',
  'ANALYSIS_ANSWER',
  'ANALYSIS_REVISION_FEEDBACK',
  'TARGET_OBSERVATION_BUNDLE',
  'RESOURCE_RESOLUTION_BUNDLE',
  'SCENARIO_PORTFOLIO_REVISION',
  'SCENARIO_REVISION',
  'TEST_SUITE',
  'TEST_CASE',
  'RUNTIME_CAPSULE',
  'TEST_RUN',
  'EVIDENCE_RECEIPT',
  'TEST_REPORT_ANALYSIS_REVISION',
  'JOURNEY_APPROVAL',
  'JOURNEY_CLOSURE',
])
type QualityJourneyArtifactKind = z.infer<typeof qualityJourneyArtifactKindSchema>

export const journeyWorkItemStatusSchema = z.enum([
  'ELIGIBLE',
  'WORK_ITEM_ISSUED',
  'WORKER_REQUESTED',
  'WORKER_STARTED',
  'IN_PROGRESS',
  'QUESTION_RAISED',
  'WAITING_FOR_INPUT',
  'OUTPUT_SUBMITTED',
  'OUTPUT_VALIDATED',
  'COMPLETED',
  'BLOCKED',
  'ESCALATED',
  'LEASE_EXPIRED',
  'REPLACEMENT_REQUESTED',
  'REVISION_REQUIRED',
  'CANCELLED',
  'SUPERSEDED',
])
export type JourneyWorkItemStatus = z.infer<typeof journeyWorkItemStatusSchema>

const artifactReferenceSchema = z
  .object({ kind: qualityJourneyArtifactKindSchema, artifactId: id, revisionId: id.optional(), contentHash: digest })
  .strict()
  .superRefine((reference, context) => {
    if (reference.kind.endsWith('_REVISION') && !reference.revisionId)
      context.addIssue({ code: 'custom', path: ['revisionId'], message: 'Revisioned artifacts require revisionId.' })
  })

export const journeyArtifactLinkSchema = z
  .object({
    schemaVersion: z.literal(qualityJourneyContractVersion),
    linkId: id,
    journeyId: id,
    targetProjectId: id,
    cycleId: id,
    relation: z.enum([
      'TRACES_TO',
      'APPROVES',
      'MATERIALIZES',
      'EXECUTES',
      'PRODUCES_EVIDENCE',
      'ATTRIBUTES',
      'ANALYZES',
      'SUPERSEDES',
      'RERUNS',
    ]),
    source: artifactReferenceSchema,
    target: artifactReferenceSchema,
  })
  .strict()
  .superRefine((link, context) => {
    const allowed: Record<
      string,
      readonly [readonly QualityJourneyArtifactKind[], readonly QualityJourneyArtifactKind[]]
    > = {
      TRACES_TO: [
        ['SCENARIO_REVISION', 'TEST_CASE'],
        ['ANALYSIS_CHARTER_REVISION', 'SCENARIO_REVISION'],
      ],
      APPROVES: [
        ['JOURNEY_APPROVAL'],
        [
          'ANALYSIS_CHARTER_REVISION',
          'SCENARIO_PORTFOLIO_REVISION',
          'SCENARIO_REVISION',
          'TEST_REPORT_ANALYSIS_REVISION',
        ],
      ],
      MATERIALIZES: [['SCENARIO_REVISION'], ['TEST_SUITE', 'TEST_CASE', 'RUNTIME_CAPSULE']],
      EXECUTES: [['RUNTIME_CAPSULE'], ['TEST_RUN']],
      PRODUCES_EVIDENCE: [['TEST_RUN'], ['EVIDENCE_RECEIPT']],
      ATTRIBUTES: [['TEST_REPORT_ANALYSIS_REVISION'], ['EVIDENCE_RECEIPT']],
      ANALYZES: [['TEST_REPORT_ANALYSIS_REVISION'], ['TEST_RUN', 'SCENARIO_REVISION', 'ANALYSIS_CHARTER_REVISION']],
      SUPERSEDES: [
        [
          'ANALYSIS_CHARTER_REVISION',
          'SCENARIO_PORTFOLIO_REVISION',
          'SCENARIO_REVISION',
          'TEST_REPORT_ANALYSIS_REVISION',
        ],
        [
          'ANALYSIS_CHARTER_REVISION',
          'SCENARIO_PORTFOLIO_REVISION',
          'SCENARIO_REVISION',
          'TEST_REPORT_ANALYSIS_REVISION',
        ],
      ],
      RERUNS: [['TEST_RUN'], ['TEST_RUN']],
    }
    const [sources, targets] = allowed[link.relation]
    if (!sources.includes(link.source.kind) || !targets.includes(link.target.kind))
      context.addIssue({ code: 'custom', message: 'Artifact kinds are invalid for this relation.' })
  })

export const testOutcomeAttributionSchema = z
  .object({
    schemaVersion: z.literal(qualityJourneyContractVersion),
    attributionId: id,
    journeyId: id,
    targetProjectId: id,
    cycleId: id,
    reportRevision: artifactReferenceSchema,
    kind: z.enum([
      'TARGET_DEFECT',
      'REQUIREMENT_AMBIGUITY',
      'VALIDATION_DESIGN_DEFECT',
      'VALIDATION_REALIZATION_DEFECT',
      'APPRAISE_RUNTIME_DEFECT',
      'ENVIRONMENT_OR_DATA_DEFECT',
      'AUTOMATION_BLOCKED',
      'INCONCLUSIVE',
    ]),
    targetOutcome: z.enum(['PASSED', 'FAILED', 'NOT_EVALUATED']),
    evidence: z.array(artifactReferenceSchema).min(1),
    confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    competingHypotheses: z.array(nonEmptyText),
    rationale: nonEmptyText,
  })
  .strict()
  .superRefine((attribution, context) => {
    if (attribution.reportRevision.kind !== 'TEST_REPORT_ANALYSIS_REVISION')
      context.addIssue({
        code: 'custom',
        path: ['reportRevision'],
        message: 'Attribution requires an exact report revision.',
      })
    if (attribution.evidence.some(reference => reference.kind !== 'EVIDENCE_RECEIPT'))
      context.addIssue({
        code: 'custom',
        path: ['evidence'],
        message: 'Attribution evidence must use sealed evidence receipts.',
      })
    if (attribution.kind !== 'TARGET_DEFECT' && attribution.targetOutcome === 'FAILED')
      context.addIssue({
        code: 'custom',
        path: ['targetOutcome'],
        message: 'Only target defects may classify the target as failed.',
      })
  })

export const providerCapabilityProfileSchema = z
  .object({
    schemaVersion: z.literal(qualityJourneyContractVersion),
    profileId: id,
    minimumJudgment: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    latencyPreference: z.enum(['FAST', 'BALANCED', 'DELIBERATE']),
    contextIsolation: z.enum(['NONE', 'BOUNDED']),
    requiredTools: z.array(id).max(64),
    forbiddenTools: z.array(id).max(64),
    requiredRuntimeBoundaries: z.array(
      z.enum(['CONTEXT', 'FILESYSTEM', 'NETWORK', 'TARGET', 'CREDENTIAL', 'LIFECYCLE_COMMAND']),
    ),
    requiredVerifiedRuntimeBoundaries: z.array(
      z.enum(['CONTEXT', 'FILESYSTEM', 'NETWORK', 'TARGET', 'CREDENTIAL', 'LIFECYCLE_COMMAND']),
    ),
  })
  .strict()
  .superRefine((profile, context) => {
    if (
      new Set(profile.requiredTools).size !== profile.requiredTools.length ||
      new Set(profile.forbiddenTools).size !== profile.forbiddenTools.length
    )
      context.addIssue({ code: 'custom', message: 'Capability tool identities must be unique.' })
    if (profile.requiredTools.some(tool => profile.forbiddenTools.includes(tool)))
      context.addIssue({ code: 'custom', message: 'A tool cannot be both required and forbidden.' })
    if (new Set(profile.requiredRuntimeBoundaries).size !== profile.requiredRuntimeBoundaries.length)
      context.addIssue({ code: 'custom', message: 'Required runtime boundaries must be unique.' })
    if (new Set(profile.requiredVerifiedRuntimeBoundaries).size !== profile.requiredVerifiedRuntimeBoundaries.length)
      context.addIssue({ code: 'custom', message: 'Required verified runtime boundaries must be unique.' })
    if (
      profile.requiredVerifiedRuntimeBoundaries.some(boundary => !profile.requiredRuntimeBoundaries.includes(boundary))
    )
      context.addIssue({ code: 'custom', message: 'A required verified boundary must be a required runtime boundary.' })
  })
export type ProviderCapabilityProfile = z.infer<typeof providerCapabilityProfileSchema>

export const roleDefinitionSchema = z
  .object({
    schemaVersion: z.literal(qualityJourneyContractVersion),
    role: qualityJourneyRoleSchema,
    purpose: nonEmptyText,
    capabilityProfileId: id,
    readableArtifacts: z.array(qualityJourneyArtifactKindSchema),
    writableArtifacts: z.array(qualityJourneyArtifactKindSchema),
    permittedTools: z.array(id).max(64),
    permittedCommands: z.array(id).max(64),
    forbiddenCapabilities: z.array(nonEmptyText).min(1),
    outputSchemaId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:/-]+$/),
    invariants: z.array(nonEmptyText).min(1),
  })
  .strict()
export type RoleDefinition = z.infer<typeof roleDefinitionSchema>

export const assignmentManifestSchema = z
  .object({
    schemaVersion: z.literal(qualityJourneyContractVersion),
    assignmentId: id,
    journeyId: id,
    targetProjectId: id,
    workItemId: id,
    roleDefinition: z.object({ role: qualityJourneyRoleSchema, version: id, digest }).strict(),
    capabilityProfile: z.object({ profileId: id, version: id, digest }).strict(),
    inputArtifacts: z.array(artifactReferenceSchema).max(256),
    allowedTargetRoutes: z.array(z.string().min(1).max(2_000)).max(128),
    allowedResourceIds: z.array(id).max(512),
    writableArtifactKinds: z.array(qualityJourneyArtifactKindSchema),
    scope: z
      .object({
        permittedTools: z.array(id).max(64),
        permittedCommands: z.array(id).max(64),
        filesystemPaths: z.array(z.string().min(1).max(2_000)).max(128),
        networkOrigins: z.array(z.string().url()).max(64),
        credentialGrantIds: z.array(id).max(32),
        targetAccess: z.enum(['NONE', 'READ_ONLY', 'MUTATING']),
      })
      .strict(),
    stateHash: digest,
    inputHash: digest,
    replacement: z
      .object({
        projectionHash: digest,
        predecessorAttemptId: id,
        diagnostics: z
          .object({
            status: z.string().min(1).max(100),
            completedAt: z.string().datetime().optional(),
            resultHash: digest.optional(),
            failureHash: digest.optional(),
          })
          .strict(),
      })
      .strict()
      .optional(),
    lease: z
      .object({ leaseId: id, expiresAt: z.string().datetime(), heartbeatSeconds: z.number().int().positive() })
      .strict(),
    idempotencyKey: id,
    completionCriteria: z.array(nonEmptyText).min(1),
  })
  .strict()
export type AssignmentManifest = z.infer<typeof assignmentManifestSchema>

function assignmentIdentityViolations(
  manifest: AssignmentManifest,
  roleDefinition: RoleDefinition,
  capabilityProfile: ProviderCapabilityProfile,
): string[] {
  const violations: string[] = []
  if (manifest.roleDefinition.role !== roleDefinition.role) violations.push('role definition identity mismatch')
  if (manifest.capabilityProfile.profileId !== capabilityProfile.profileId)
    violations.push('capability profile identity mismatch')
  return violations
}

function assignmentAuthorityViolations(manifest: AssignmentManifest, roleDefinition: RoleDefinition): string[] {
  const violations: string[] = []
  if (manifest.writableArtifactKinds.some(kind => !roleDefinition.writableArtifacts.includes(kind)))
    violations.push('writable artifact scope exceeds role authority')
  if (manifest.inputArtifacts.some(reference => !roleDefinition.readableArtifacts.includes(reference.kind)))
    violations.push('input artifact scope exceeds role authority')
  if (manifest.scope.permittedTools.some(tool => !roleDefinition.permittedTools.includes(tool)))
    violations.push('tool scope exceeds role authority')
  if (manifest.scope.permittedCommands.some(command => !roleDefinition.permittedCommands.includes(command)))
    violations.push('command scope exceeds role authority')
  if (!roleDefinition.permittedTools.includes('target.observe') && manifest.scope.targetAccess !== 'NONE')
    violations.push('target access exceeds role authority')
  if (roleDefinition.role === 'SCOUT' && manifest.scope.targetAccess !== 'READ_ONLY')
    violations.push('Scout target access must be read-only')
  return violations
}

function assignmentBoundaryViolations(
  manifest: AssignmentManifest,
  capabilityProfile: ProviderCapabilityProfile,
): string[] {
  const violations: string[] = []
  if (capabilityProfile.requiredTools.some(tool => !manifest.scope.permittedTools.includes(tool)))
    violations.push('assignment omits a required capability tool')
  if (!capabilityProfile.requiredRuntimeBoundaries.includes('FILESYSTEM') && manifest.scope.filesystemPaths.length > 0)
    violations.push('filesystem scope was granted without a filesystem boundary')
  if (!capabilityProfile.requiredRuntimeBoundaries.includes('NETWORK') && manifest.scope.networkOrigins.length > 0)
    violations.push('network scope was granted without a network boundary')
  if (
    !capabilityProfile.requiredRuntimeBoundaries.includes('CREDENTIAL') &&
    manifest.scope.credentialGrantIds.length > 0
  )
    violations.push('credential scope was granted without a credential boundary')
  return violations
}

export function validateAssignmentManifest(
  value: unknown,
  roleDefinition: RoleDefinition,
  capabilityProfile: ProviderCapabilityProfile,
): AssignmentManifest {
  const manifest = assignmentManifestSchema.parse(value)
  const violations = [
    ...assignmentIdentityViolations(manifest, roleDefinition, capabilityProfile),
    ...assignmentAuthorityViolations(manifest, roleDefinition),
    ...assignmentBoundaryViolations(manifest, capabilityProfile),
  ]
  if (violations.length > 0) throw new Error(`Invalid assignment manifest: ${violations.join('; ')}.`)
  return manifest
}

const runtimeBoundarySchema = z
  .object({
    boundary: z.enum([
      'MODEL',
      'REASONING',
      'TOOLS',
      'FILESYSTEM',
      'NETWORK',
      'CONTEXT',
      'TARGET',
      'CREDENTIAL',
      'LIFECYCLE_COMMAND',
    ]),
    requested: z.array(z.string().min(1).max(2_000)).max(256),
    status: z.enum(['ENFORCED', 'VERIFIED', 'UNVERIFIED', 'UNSUPPORTED']),
    effective: z.array(z.string().min(1).max(2_000)).max(256).optional(),
    evidence: z.array(digest).max(32),
  })
  .strict()
const spawnReceiptBase = z.object({
  schemaVersion: z.literal(qualityJourneyContractVersion),
  spawnReceiptId: id,
  assignmentId: id,
  workItemId: id,
  attemptId: id,
  roleDefinitionDigest: digest,
  capabilityProfileDigest: digest,
  boundaries: z.array(runtimeBoundarySchema).min(1),
})

export const workerSpawnReceiptSchema = z.union([
  spawnReceiptBase
    .extend({
      outcome: z.literal('STARTED'),
      // Model identity is receipt-only provider evidence. It is never copied
      // into an authorization, assignment, replacement projection, or request.
      effectiveWorker: z
        .object({
          modelId: id,
          reasoningLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
          latencyPreference: z.enum(['FAST', 'BALANCED', 'DELIBERATE']),
          toolIds: z.array(id),
        })
        .strict(),
      startedAt: z.string().datetime(),
    })
    .strict()
    .superRefine((receipt, context) => {
      if (receipt.boundaries.some(boundary => ['UNSUPPORTED', 'UNVERIFIED'].includes(boundary.status)))
        context.addIssue({
          code: 'custom',
          path: ['boundaries'],
          message: 'A worker cannot start with an unsupported or unverified requested boundary.',
        })
    }),
  spawnReceiptBase
    .extend({
      outcome: z.literal('REFUSED'),
      refusalCode: z.enum(['REQUIRED_BOUNDARY_UNSUPPORTED', 'REQUIRED_BOUNDARY_UNVERIFIED']),
      refusedAt: z.string().datetime(),
    })
    .strict()
    .superRefine((receipt, context) => {
      const expectedStatus = receipt.refusalCode === 'REQUIRED_BOUNDARY_UNSUPPORTED' ? 'UNSUPPORTED' : 'UNVERIFIED'
      if (!receipt.boundaries.some(boundary => boundary.status === expectedStatus))
        context.addIssue({
          code: 'custom',
          path: ['boundaries'],
          message: 'Refusal code requires matching boundary evidence.',
        })
    }),
])
export type WorkerSpawnReceipt = z.infer<typeof workerSpawnReceiptSchema>

export const workerResultEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(qualityJourneyContractVersion),
    assignmentId: id,
    workItemId: id,
    attemptId: id,
    roleContractDigest: digest,
    inputHash: digest,
    role: qualityJourneyRoleSchema,
    status: z.enum(['COMPLETED', 'BLOCKED', 'QUESTION_RAISED', 'REVISION_REQUIRED']),
    outputs: z.array(artifactReferenceSchema).max(256),
    evidenceReceipts: z.array(digest).max(512),
    assumptions: z.array(nonEmptyText).max(128),
    blockers: z.array(
      z
        .object({ code: id, summary: nonEmptyText, evidence: z.array(digest), requiredResolution: nonEmptyText })
        .strict(),
    ),
    unresolvedQuestions: z.array(z.object({ questionId: id, prompt: nonEmptyText, required: z.boolean() }).strict()),
    submittedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((result, context) => {
    const allowed: Record<QualityJourneyRole, readonly QualityJourneyArtifactKind[]> = {
      REQUIREMENT_ANALYZER: ['ANALYSIS_CHARTER_REVISION', 'ANALYSIS_QUESTION'],
      SCOUT: ['TARGET_OBSERVATION_BUNDLE', 'EVIDENCE_RECEIPT'],
      RESOURCE_EXPLORER: ['RESOURCE_RESOLUTION_BUNDLE'],
      TEST_SCENARIO_DESIGNER: ['SCENARIO_PORTFOLIO_REVISION', 'SCENARIO_REVISION'],
      AUTOMATOR: ['TEST_SUITE', 'TEST_CASE', 'RUNTIME_CAPSULE'],
      TRIAGER: ['TEST_REPORT_ANALYSIS_REVISION'],
    }
    if (result.outputs.some(output => !allowed[result.role].includes(output.kind)))
      context.addIssue({ code: 'custom', path: ['outputs'], message: 'Output artifact kind is forbidden for role.' })
  })
export type WorkerResultEnvelope = z.infer<typeof workerResultEnvelopeSchema>

export const journeyCommandKindSchema = z.enum([
  'SUBMIT_REQUIREMENT',
  'PUBLISH_ANALYSIS',
  'DECIDE_ANALYSIS',
  'REQUEST_ANALYSIS_REVISION',
  'RETRY_DISCOVERY',
  'START_SCENARIO_DESIGN',
  'PUBLISH_SCENARIO_PORTFOLIO',
  'DECIDE_SCENARIOS',
  'REQUEST_SCENARIO_REVISION',
  'RETRY_AUTOMATION',
  'START_EXECUTION',
  'PUBLISH_RUN_RESULT',
  'PUBLISH_TRIAGE_REPORT',
  'REQUEST_REPORT_REVISION',
  'START_REMEDIATION_CYCLE',
  'CLOSE_JOURNEY',
  'RISK_ACCEPT_AND_CLOSE',
  'RESUME_BLOCKER',
])

const commandBase = z.object({
  schemaVersion: z.literal(qualityJourneyContractVersion),
  commandId: id,
  journeyId: id,
  targetProjectId: id,
  actor: z.enum(['USER', 'COORDINATOR', 'RUNNER', 'MANAGED_RUNTIME']),
  expectedStateHash: digest,
  idempotencyKey: id,
  inputArtifactRefs: z.array(artifactReferenceSchema).max(256),
})

const emptyPayload = z.object({}).strict()
const publicationPayload = z.object({ artifactRevisionId: id, artifactHash: digest }).strict()
const revisionRequestPayload = z
  .object({ reviewedRevisionId: id, reviewedHash: digest, feedback: nonEmptyText })
  .strict()

export const journeyCommandSchema = z.discriminatedUnion('command', [
  commandBase
    .extend({
      command: z.literal('SUBMIT_REQUIREMENT'),
      payload: z.object({ journeyRevisionId: id, requirementHash: digest }).strict(),
    })
    .strict(),
  commandBase.extend({ command: z.literal('PUBLISH_ANALYSIS'), payload: publicationPayload }).strict(),
  commandBase
    .extend({
      command: z.literal('DECIDE_ANALYSIS'),
      payload: z.object({ revisionId: id, contentHash: digest, decision: z.literal('APPROVED') }).strict(),
    })
    .strict(),
  commandBase.extend({ command: z.literal('REQUEST_ANALYSIS_REVISION'), payload: revisionRequestPayload }).strict(),
  commandBase
    .extend({
      command: z.literal('RETRY_DISCOVERY'),
      payload: z.object({ blockerId: id, resolutionArtifactIds: z.array(id).min(1) }).strict(),
    })
    .strict(),
  commandBase.extend({ command: z.literal('START_SCENARIO_DESIGN'), payload: emptyPayload }).strict(),
  commandBase.extend({ command: z.literal('PUBLISH_SCENARIO_PORTFOLIO'), payload: publicationPayload }).strict(),
  commandBase
    .extend({
      command: z.literal('DECIDE_SCENARIOS'),
      payload: z
        .object({
          portfolioRevisionId: id,
          portfolioHash: digest,
          approvedScenarioRevisionIds: z.array(id).min(1),
          rejectedScenarioRevisionIds: z.array(id),
          feedback: nonEmptyText.optional(),
        })
        .strict(),
    })
    .strict(),
  commandBase.extend({ command: z.literal('REQUEST_SCENARIO_REVISION'), payload: revisionRequestPayload }).strict(),
  commandBase
    .extend({
      command: z.literal('RETRY_AUTOMATION'),
      payload: z.object({ blockerId: id, approvedScenarioRevisionIds: z.array(id).min(1) }).strict(),
    })
    .strict(),
  commandBase
    .extend({
      command: z.literal('START_EXECUTION'),
      payload: z.object({ runtimeCapsuleIds: z.array(id).min(1), executionConsentId: id.optional() }).strict(),
    })
    .strict(),
  commandBase
    .extend({
      command: z.literal('PUBLISH_RUN_RESULT'),
      payload: z.object({ testRunIds: z.array(id).min(1), evidenceReceiptIds: z.array(id).min(1) }).strict(),
    })
    .strict(),
  commandBase.extend({ command: z.literal('PUBLISH_TRIAGE_REPORT'), payload: publicationPayload }).strict(),
  commandBase.extend({ command: z.literal('REQUEST_REPORT_REVISION'), payload: revisionRequestPayload }).strict(),
  commandBase
    .extend({
      command: z.literal('START_REMEDIATION_CYCLE'),
      payload: z.object({ reportRevisionId: id, remediationScope: nonEmptyText }).strict(),
    })
    .strict(),
  commandBase
    .extend({
      command: z.literal('CLOSE_JOURNEY'),
      payload: z.object({ closureId: id, reportRevisionId: id, reportHash: digest }).strict(),
    })
    .strict(),
  commandBase
    .extend({
      command: z.literal('RISK_ACCEPT_AND_CLOSE'),
      payload: z
        .object({
          closureId: id,
          reportRevisionId: id,
          reportHash: digest,
          rationale: nonEmptyText,
          acceptedItemIds: z.array(id).min(1),
        })
        .strict(),
    })
    .strict(),
  commandBase
    .extend({
      command: z.literal('RESUME_BLOCKER'),
      payload: z.object({ blockerId: id, resolutionArtifactIds: z.array(id).min(1) }).strict(),
    })
    .strict(),
])
export type JourneyCommand = z.infer<typeof journeyCommandSchema>

export const journeyCommandResultSchema = z.discriminatedUnion('outcome', [
  z
    .object({
      schemaVersion: z.literal(qualityJourneyContractVersion),
      outcome: z.literal('COMMITTED'),
      commandId: id,
      eventId: id,
      successorStateHash: digest,
      successorStage: qualityJourneyStageSchema,
      replayed: z.boolean(),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(qualityJourneyContractVersion),
      outcome: z.literal('CONFLICT'),
      commandId: id,
      code: z.enum(['STALE_STATE_HASH', 'IDEMPOTENCY_KEY_REUSED', 'PRECONDITION_FAILED']),
      currentStateHash: digest,
      currentStage: qualityJourneyStageSchema,
      safeNextCommands: z.array(journeyCommandKindSchema),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(qualityJourneyContractVersion),
      outcome: z.literal('REJECTED'),
      commandId: id,
      code: id,
      message: nonEmptyText,
    })
    .strict(),
])

type ClosureContractInput = {
  decision: 'CLOSED' | 'RISK_ACCEPTED'
  unresolvedItems: readonly { itemId: string }[]
  riskAcceptance?: { acceptedItemIds: readonly string[] }
}

function closureDecisionIssues(closure: ClosureContractInput): string[] {
  const issues: string[] = []
  if (closure.unresolvedItems.length > 0 && closure.decision !== 'RISK_ACCEPTED')
    issues.push('Unresolved items require explicit risk acceptance.')
  if (closure.decision === 'RISK_ACCEPTED' && !closure.riskAcceptance)
    issues.push('Risk-accepted closure requires a risk acceptance receipt.')
  if (closure.decision === 'CLOSED' && closure.riskAcceptance)
    issues.push('Normal closure cannot contain a risk acceptance receipt.')
  return issues
}

function closureIdentityIssues(closure: ClosureContractInput): string[] {
  if (!closure.riskAcceptance) return []

  const issues: string[] = []
  const unresolvedIds = [...new Set(closure.unresolvedItems.map(item => item.itemId))].sort()
  const acceptedIds = [...new Set(closure.riskAcceptance.acceptedItemIds)].sort()
  if (
    unresolvedIds.length !== closure.unresolvedItems.length ||
    acceptedIds.length !== closure.riskAcceptance.acceptedItemIds.length
  )
    issues.push('Closure item identities must be unique.')
  if (
    unresolvedIds.length !== acceptedIds.length ||
    unresolvedIds.some((itemId, index) => itemId !== acceptedIds[index])
  )
    issues.push('Risk acceptance must bind every exact unresolved item.')
  return issues
}

function closureContractIssues(closure: ClosureContractInput): string[] {
  return [...closureDecisionIssues(closure), ...closureIdentityIssues(closure)]
}

export const journeyClosureSchema = z
  .object({
    schemaVersion: z.literal(qualityJourneyContractVersion),
    closureId: id,
    journeyId: id,
    cycleId: id,
    reportRevision: artifactReferenceSchema.refine(value => value.kind === 'TEST_REPORT_ANALYSIS_REVISION'),
    decision: z.enum(['CLOSED', 'RISK_ACCEPTED']),
    actorId: id,
    unresolvedItems: z.array(
      z.object({ itemId: id, summary: nonEmptyText, artifactRefs: z.array(artifactReferenceSchema) }).strict(),
    ),
    riskAcceptance: z
      .object({ rationale: nonEmptyText, acceptedItemIds: z.array(id).min(1), acceptedAt: z.string().datetime() })
      .strict()
      .optional(),
    closedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((closure, context) => {
    for (const message of closureContractIssues(closure)) context.addIssue({ code: 'custom', message })
  })

export const artifactReferenceContractSchema = artifactReferenceSchema
