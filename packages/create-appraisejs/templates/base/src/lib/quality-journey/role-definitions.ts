import { createHash } from 'node:crypto'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import type { ProviderCapabilityProfile, RoleDefinition } from './contracts'
import { providerCapabilityProfileSchema, qualityJourneyContractVersion, roleDefinitionSchema } from './contracts'

/** Historical registries remain immutable for already-issued Factory authorizations.
 * Version 4 grants a successor Designer its prior portfolio and durable feedback. */
export const qualityJourneyRoleRegistryVersion = '4' as const

export function qualityJourneyContractDigest(value: RoleDefinition | ProviderCapabilityProfile): string {
  return `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
}

export const qualityJourneyCapabilityProfiles = {
  structuredAnalysis: {
    schemaVersion: qualityJourneyContractVersion,
    profileId: 'structured-analysis',
    minimumJudgment: 'HIGH',
    latencyPreference: 'DELIBERATE',
    contextIsolation: 'BOUNDED',
    requiredTools: ['artifact.read', 'artifact.propose'],
    forbiddenTools: ['target.observe', 'execution.start'],
    requiredRuntimeBoundaries: ['CONTEXT', 'LIFECYCLE_COMMAND'],
    requiredVerifiedRuntimeBoundaries: ['CONTEXT', 'LIFECYCLE_COMMAND'],
  },
  fastObservation: {
    schemaVersion: qualityJourneyContractVersion,
    profileId: 'fast-observation',
    minimumJudgment: 'MEDIUM',
    latencyPreference: 'FAST',
    contextIsolation: 'BOUNDED',
    requiredTools: ['target.observe', 'evidence.publish'],
    forbiddenTools: ['catalog.write', 'lifecycle.approve'],
    requiredRuntimeBoundaries: ['CONTEXT', 'TARGET', 'NETWORK'],
    requiredVerifiedRuntimeBoundaries: ['CONTEXT', 'TARGET', 'NETWORK'],
  },
  resourceResolution: {
    schemaVersion: qualityJourneyContractVersion,
    profileId: 'resource-resolution',
    minimumJudgment: 'MEDIUM',
    latencyPreference: 'FAST',
    contextIsolation: 'BOUNDED',
    requiredTools: ['catalog.search', 'artifact.read'],
    forbiddenTools: ['target.observe', 'catalog.write'],
    requiredRuntimeBoundaries: ['CONTEXT', 'TARGET', 'NETWORK', 'LIFECYCLE_COMMAND'],
    requiredVerifiedRuntimeBoundaries: ['CONTEXT', 'TARGET', 'NETWORK', 'LIFECYCLE_COMMAND'],
  },
  highJudgmentDesign: {
    schemaVersion: qualityJourneyContractVersion,
    profileId: 'high-judgment-design',
    minimumJudgment: 'HIGH',
    latencyPreference: 'DELIBERATE',
    contextIsolation: 'BOUNDED',
    requiredTools: ['artifact.read', 'scenario.propose'],
    forbiddenTools: ['target.observe', 'automation.write', 'lifecycle.approve'],
    requiredRuntimeBoundaries: ['CONTEXT', 'LIFECYCLE_COMMAND'],
    requiredVerifiedRuntimeBoundaries: ['CONTEXT', 'LIFECYCLE_COMMAND'],
  },
  mechanicalImplementation: {
    schemaVersion: qualityJourneyContractVersion,
    profileId: 'mechanical-implementation',
    minimumJudgment: 'MEDIUM',
    latencyPreference: 'BALANCED',
    contextIsolation: 'BOUNDED',
    requiredTools: ['catalog.search', 'automation.write', 'runtime-capsule.publish'],
    forbiddenTools: ['scenario.intent.write', 'lifecycle.approve'],
    requiredRuntimeBoundaries: ['CONTEXT', 'FILESYSTEM', 'TARGET', 'LIFECYCLE_COMMAND'],
    requiredVerifiedRuntimeBoundaries: ['CONTEXT', 'FILESYSTEM', 'TARGET', 'LIFECYCLE_COMMAND'],
  },
  independentAttribution: {
    schemaVersion: qualityJourneyContractVersion,
    profileId: 'independent-attribution',
    minimumJudgment: 'HIGH',
    latencyPreference: 'DELIBERATE',
    contextIsolation: 'NONE',
    requiredTools: ['artifact.read', 'evidence.read', 'report.propose'],
    forbiddenTools: ['automation.write', 'target.mutate', 'lifecycle.approve'],
    requiredRuntimeBoundaries: ['CONTEXT', 'FILESYSTEM', 'NETWORK', 'LIFECYCLE_COMMAND'],
    requiredVerifiedRuntimeBoundaries: ['CONTEXT', 'FILESYSTEM', 'NETWORK', 'LIFECYCLE_COMMAND'],
  },
} as const satisfies Record<string, ProviderCapabilityProfile>

const qualityJourneyRoleDefinitionsV3 = [
  {
    schemaVersion: qualityJourneyContractVersion,
    role: 'REQUIREMENT_ANALYZER',
    purpose: 'Propose a revisioned Analysis Charter and unresolved requirement questions.',
    capabilityProfileId: 'structured-analysis',
    readableArtifacts: [
      'JOURNEY_REVISION',
      'ANALYSIS_CHARTER_REVISION',
      'ANALYSIS_QUESTION',
      'ANALYSIS_ANSWER',
      'ANALYSIS_REVISION_FEEDBACK',
    ],
    writableArtifacts: ['ANALYSIS_CHARTER_REVISION', 'ANALYSIS_QUESTION'],
    permittedTools: ['artifact.read', 'artifact.propose'],
    permittedCommands: ['work.output.submit'],
    forbiddenCapabilities: ['Approve analysis', 'Observe the target', 'Design or implement automation'],
    outputSchemaId: 'appraise.quality-journey-worker-result/v1',
    invariants: ['Required unresolved questions remain explicit.', 'Every obligation traces to a requirement.'],
  },
  {
    schemaVersion: qualityJourneyContractVersion,
    role: 'SCOUT',
    purpose: 'Publish bounded target observations with evidence, confidence, stability, and revalidation policy.',
    capabilityProfileId: 'fast-observation',
    readableArtifacts: ['ANALYSIS_CHARTER_REVISION', 'JOURNEY_APPROVAL'],
    writableArtifacts: ['TARGET_OBSERVATION_BUNDLE', 'EVIDENCE_RECEIPT'],
    permittedTools: ['target.observe', 'evidence.publish'],
    permittedCommands: ['work.output.submit'],
    forbiddenCapabilities: ['Mutate Appraise catalogs', 'Change scenario intent', 'Attribute test failures'],
    outputSchemaId: 'appraise.quality-journey-worker-result/v1',
    invariants: ['Every fact identifies its target snapshot and evidence.', 'Unverified observations remain explicit.'],
  },
  {
    schemaVersion: qualityJourneyContractVersion,
    role: 'RESOURCE_EXPLORER',
    purpose: 'Resolve reusable Appraise-owned resources and declare compatibility gaps.',
    capabilityProfileId: 'resource-resolution',
    readableArtifacts: ['ANALYSIS_CHARTER_REVISION', 'JOURNEY_APPROVAL'],
    writableArtifacts: ['RESOURCE_RESOLUTION_BUNDLE'],
    permittedTools: ['catalog.search', 'artifact.read'],
    permittedCommands: ['work.output.submit'],
    forbiddenCapabilities: ['Browse or mutate the target', 'Mutate catalog resources', 'Decide behavioral coverage'],
    outputSchemaId: 'appraise.quality-journey-worker-result/v1',
    invariants: ['Candidates use stable Appraise IDs.', 'Rejected candidates and missing capabilities are explicit.'],
  },
  {
    schemaVersion: qualityJourneyContractVersion,
    role: 'TEST_SCENARIO_DESIGNER',
    purpose: 'Propose behavioral scenario intent and coverage traceability from approved requirements.',
    capabilityProfileId: 'high-judgment-design',
    readableArtifacts: ['ANALYSIS_CHARTER_REVISION', 'TARGET_OBSERVATION_BUNDLE', 'RESOURCE_RESOLUTION_BUNDLE'],
    writableArtifacts: ['SCENARIO_PORTFOLIO_REVISION', 'SCENARIO_REVISION'],
    permittedTools: ['artifact.read', 'scenario.propose'],
    permittedCommands: ['work.output.submit'],
    forbiddenCapabilities: ['Invent target facts', 'Create automation', 'Approve scenarios'],
    outputSchemaId: 'appraise.quality-journey-worker-result/v1',
    invariants: ['Every scenario traces to approved requirements or an exploratory rationale.'],
  },
  {
    schemaVersion: qualityJourneyContractVersion,
    role: 'AUTOMATOR',
    purpose: 'Materialize approved scenario intent into executable Appraise-owned artifacts.',
    capabilityProfileId: 'mechanical-implementation',
    readableArtifacts: ['SCENARIO_PORTFOLIO_REVISION', 'SCENARIO_REVISION', 'RESOURCE_RESOLUTION_BUNDLE'],
    writableArtifacts: ['TEST_SUITE', 'TEST_CASE', 'RUNTIME_CAPSULE'],
    permittedTools: ['catalog.search', 'automation.write', 'runtime-capsule.publish'],
    permittedCommands: ['work.output.submit'],
    forbiddenCapabilities: ['Change approved scenario intent', 'Approve implementation', 'Attribute final failures'],
    outputSchemaId: 'appraise.quality-journey-worker-result/v1',
    invariants: ['Compatible catalog resources are reused before a capability gap is declared.'],
  },
  {
    schemaVersion: qualityJourneyContractVersion,
    role: 'TRIAGER',
    purpose: 'Independently attribute sealed outcomes and propose a revisioned Test Report Analysis.',
    capabilityProfileId: 'independent-attribution',
    readableArtifacts: ['ANALYSIS_CHARTER_REVISION', 'SCENARIO_REVISION', 'TEST_RUN', 'EVIDENCE_RECEIPT'],
    writableArtifacts: ['TEST_REPORT_ANALYSIS_REVISION'],
    permittedTools: ['artifact.read', 'evidence.read', 'report.propose'],
    permittedCommands: ['work.output.submit'],
    forbiddenCapabilities: ['Modify automation during attribution', 'Rewrite historical results', 'Approve closure'],
    outputSchemaId: 'appraise.quality-journey-worker-result/v1',
    invariants: [
      'Attribution distinguishes target, validation design, runtime, infrastructure, and inconclusive outcomes.',
    ],
  },
] as const satisfies readonly RoleDefinition[]

export const qualityJourneyRoleDefinitions = qualityJourneyRoleDefinitionsV3.map(definition =>
  definition.role === 'TEST_SCENARIO_DESIGNER'
    ? {
        ...definition,
        readableArtifacts: [
          ...definition.readableArtifacts,
          'SCENARIO_PORTFOLIO_REVISION',
          'SCENARIO_REVISION',
          'SCENARIO_REVISION_FEEDBACK',
        ] as const,
      }
    : definition,
) as readonly RoleDefinition[]

// Historical registries are frozen snapshots.  Newer Designer inputs belong
// exclusively to registry v4 and must never silently alter a v1/v2 manifest.
export const qualityJourneyRoleDefinitionsV1 = qualityJourneyRoleDefinitionsV3.map(definition =>
  definition.role === 'REQUIREMENT_ANALYZER'
    ? {
        ...definition,
        readableArtifacts: ['JOURNEY_REVISION'] as const,
      }
    : definition.role === 'SCOUT' || definition.role === 'RESOURCE_EXPLORER'
      ? { ...definition, readableArtifacts: ['ANALYSIS_CHARTER_REVISION'] as const }
      : definition,
) as readonly RoleDefinition[]

export const qualityJourneyRoleDefinitionsV2 = qualityJourneyRoleDefinitionsV3.map(definition =>
  definition.role === 'SCOUT' || definition.role === 'RESOURCE_EXPLORER'
    ? { ...definition, readableArtifacts: ['ANALYSIS_CHARTER_REVISION'] as const }
    : definition,
) as readonly RoleDefinition[]

export const qualityJourneyCapabilityProfilesV2 = {
  ...qualityJourneyCapabilityProfiles,
  resourceResolution: {
    ...qualityJourneyCapabilityProfiles.resourceResolution,
    requiredRuntimeBoundaries: ['CONTEXT', 'TARGET', 'LIFECYCLE_COMMAND'] as const,
    requiredVerifiedRuntimeBoundaries: ['CONTEXT', 'TARGET', 'LIFECYCLE_COMMAND'] as const,
  },
} as const satisfies Record<string, ProviderCapabilityProfile>

export function resolveQualityJourneyRoleDefinition(version: string, role: RoleDefinition['role']) {
  const registry =
    version === '1'
      ? qualityJourneyRoleDefinitionsV1
      : version === '2'
        ? qualityJourneyRoleDefinitionsV2
        : version === '3'
          ? qualityJourneyRoleDefinitionsV3
          : version === '4'
            ? qualityJourneyRoleDefinitions
            : []
  return registry.find(definition => definition.role === role)
}

export function resolveQualityJourneyCapabilityProfile(
  version: string,
  profileId: string,
): ProviderCapabilityProfile | undefined {
  const registry: Record<string, ProviderCapabilityProfile> =
    version === '1' || version === '2'
      ? qualityJourneyCapabilityProfilesV2
      : version === '3' || version === '4'
        ? qualityJourneyCapabilityProfiles
        : {}
  return Object.values(registry).find(profile => profile.profileId === profileId)
}

for (const profile of Object.values(qualityJourneyCapabilityProfiles)) providerCapabilityProfileSchema.parse(profile)
for (const definition of qualityJourneyRoleDefinitions) roleDefinitionSchema.parse(definition)
for (const definition of qualityJourneyRoleDefinitionsV1) roleDefinitionSchema.parse(definition)
for (const definition of qualityJourneyRoleDefinitionsV2) roleDefinitionSchema.parse(definition)
for (const definition of qualityJourneyRoleDefinitionsV3) roleDefinitionSchema.parse(definition)
for (const profile of Object.values(qualityJourneyCapabilityProfilesV2)) providerCapabilityProfileSchema.parse(profile)
