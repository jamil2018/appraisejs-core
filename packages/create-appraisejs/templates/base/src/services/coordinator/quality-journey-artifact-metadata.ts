import { Prisma } from '@prisma/client'

type Source = {
  kind: string
  table: string
  join?: string
  owner?: string
  predicate?: string
  source?: string
  identity?: string
  artifact?: string
  revision?: string
  cycle?: string
  hash?: string
  time?: string
  title?: string
  kindSql?: string
}

// Static SQL projections only. Caller identifiers are always bound parameters.
// SQLite JSON traversal exposes finding IDs, never full report payloads.
const sources: Source[] = [
  {
    kind: 'REQUIREMENT_REVISION',
    table: 'QualityJourneyRevision',
    hash: 'q.contentHash',
    revision: 'CAST(q.revision AS TEXT)',
  },
  {
    kind: 'ARTIFACT',
    table: 'QualityJourneyArtifact',
    kindSql: 'q.kind',
    artifact: 'q.artifactId',
    revision: 'q.revisionId',
    cycle: 'q.cycleId',
    hash: 'q.contentHash',
  },
  { kind: 'ARTIFACT_LINK', table: 'QualityJourneyArtifactLink', cycle: 'q.cycleId', hash: 'q.linkHash' },
  { kind: 'CYCLE', table: 'QualityJourneyCycle', revision: 'CAST(q.sequence AS TEXT)', cycle: 'q.id' },
  {
    kind: 'ANALYSIS_REVISION',
    table: 'QualityJourneyAnalysisRevision',
    artifact: 'q.artifactRevisionId',
    revision: 'q.artifactRevisionId',
    cycle: 'q.cycleId',
    hash: 'q.contentHash',
  },
  {
    kind: 'DISCOVERY_REVISION',
    table: 'QualityJourneyDiscoveryRevision',
    revision: 'q.id',
    cycle: 'q.cycleId',
    hash: 'q.completionHash',
  },
  {
    kind: 'SCENARIO_PORTFOLIO',
    table: 'QualityJourneyScenarioPortfolioRevision',
    artifact: 'q.artifactRevisionId',
    revision: 'q.artifactRevisionId',
    cycle: 'q.cycleId',
    hash: 'q.contentHash',
  },
  {
    kind: 'SCENARIO_REVISION',
    table: 'QualityJourneyScenarioRevision',
    join: 'JOIN QualityJourneyScenarioPortfolioRevision p ON p.id=q.portfolioRevisionId',
    owner: 'p.journeyId',
    artifact: 'q.stableScenarioId',
    revision: 'q.scenarioRevisionId',
    cycle: 'p.cycleId',
    hash: 'q.contentHash',
  },
  {
    kind: 'SCENARIO_DECISION',
    table: 'QualityJourneyScenarioDecision',
    join: 'JOIN QualityJourneyScenarioPortfolioRevision p ON p.id=q.portfolioRevisionId',
    owner: 'p.journeyId',
    revision: 'q.scenarioRevisionId',
    cycle: 'p.cycleId',
    hash: 'q.contentHash',
  },
  {
    kind: 'SCENARIO_REVIEW_COMMENT',
    table: 'QualityJourneyScenarioReviewComment',
    join: 'JOIN QualityJourneyScenarioPortfolioRevision p ON p.id=q.portfolioRevisionId',
    owner: 'p.journeyId',
    revision: 'q.scenarioRevisionId',
  },
  {
    kind: 'SCENARIO_DECISION_RECEIPT',
    table: 'QualityJourneyScenarioDecisionReceipt',
    revision: 'q.portfolioRevisionId',
    hash: 'q.requestHash',
  },
  {
    kind: 'ANALYSIS_DECISION',
    table: 'QualityJourneyAnalysisDecision',
    revision: 'q.analysisRevisionId',
    hash: 'q.contentHash',
  },
  {
    kind: 'ANALYSIS_PUBLICATION',
    table: 'QualityJourneyAnalysisPublication',
    revision: 'q.analysisRevisionId',
    hash: 'q.artifactHash',
    time: 'q.publishedAt',
  },
  {
    kind: 'MATERIALIZATION',
    table: 'QualityJourneyAutomationMaterialization',
    revision: 'q.scenarioRevisionId',
    cycle: 'q.cycleId',
    hash: 'q.materializationHash',
  },
  {
    kind: 'PREPARED_RUNTIME_CAPSULE',
    table: 'QualityJourneyPreparedRuntimeCapsule',
    revision: 'q.materializationId',
    cycle: 'q.cycleId',
    hash: 'q.capsuleHash',
  },
  {
    kind: 'TEST_SUITE',
    table: 'TestSuite',
    owner: 'j.id',
    predicate:
      'EXISTS (SELECT 1 FROM QualityJourneyAutomationMaterialization m WHERE m.journeyId=j.id AND m.suiteId=q.id AND m.targetProjectId=j.targetProjectId)',
    title: 'q.name',
  },
  {
    kind: 'TEST_CASE',
    table: 'TestCase',
    owner: 'j.id',
    predicate:
      'EXISTS (SELECT 1 FROM QualityJourneyAutomationMaterialization m WHERE m.journeyId=j.id AND m.testCaseId=q.id AND m.targetProjectId=j.targetProjectId)',
    title: 'q.title',
  },
  {
    kind: 'EXECUTION_CYCLE',
    table: 'QualityJourneyExecutionCycle',
    cycle: 'q.cycleId',
    hash: 'q.stateHash',
    time: 'q.startedAt',
  },
  {
    kind: 'TEST_RUN',
    table: 'QualityJourneyExecutionTestRun',
    join: 'JOIN QualityJourneyExecutionCycle p ON p.id=q.executionCycleId',
    owner: 'p.journeyId',
    artifact: 'q.runId',
    revision: 'q.preparedCapsuleId',
    cycle: 'p.cycleId',
  },
  {
    kind: 'SEALED_EVIDENCE',
    table: 'QualityJourneyExecutionEvidenceReceipt',
    join: 'JOIN QualityJourneyExecutionCycle p ON p.id=q.executionCycleId',
    owner: 'p.journeyId',
    revision: 'q.testRunId',
    cycle: 'p.cycleId',
    hash: 'q.receiptHash',
  },
  { kind: 'TRIAGE_REPORT', table: 'QualityJourneyTriageReport', revision: 'q.id', hash: 'q.contentHash' },
  {
    kind: 'TRIAGE_FINDING',
    source: 'TRIAGE_REPORT',
    table: 'QualityJourneyTriageReport',
    join: "JOIN json_each(q.reportJson, '$.findings') f",
    identity: "q.id || ':' || json_extract(f.value, '$.findingId')",
    artifact: "json_extract(f.value, '$.findingId')",
    revision: 'q.id',
    hash: 'q.contentHash',
  },
  {
    kind: 'REPORT_REVIEW',
    table: 'QualityJourneyReportReview',
    revision: 'q.reportRevisionId',
    cycle: 'q.successorCycleId',
  },
  {
    kind: 'RERUN_PROPOSAL',
    table: 'QualityJourneyExecutionRerunProposal',
    revision: 'q.reportRevisionId',
    hash: 'q.proposalHash',
  },
  {
    kind: 'EXECUTION_CONSENT',
    table: 'QualityJourneyExecutionConsent',
    cycle: 'q.executionCycleId',
    hash: 'q.scopeHash',
  },
  {
    kind: 'EXECUTION_CANCELLATION',
    table: 'QualityJourneyExecutionCancellationReceipt',
    cycle: 'q.executionCycleId',
    hash: 'q.requestHash',
  },
  { kind: 'BLOCKER', table: 'QualityJourneyBlocker', title: 'q.summary' },
  {
    kind: 'CLOSURE',
    kindSql: "'JOURNEY_CLOSURE'",
    table: 'QualityJourneyClosure',
    revision: 'q.reportRevisionId',
    cycle: 'q.cycleId',
    hash: 'q.contentHash',
    time: 'q.closedAt',
  },
]

export type JourneyArtifactMetadata = {
  entryId: string
  source: string
  recordId: string
  kind: string
  title: string
  artifactId: string
  revisionId: string | null
  cycleId: string | null
  contentHash: string | null
  createdAt: Date | string | number
}

const projectScopedTables = new Set([
  'QualityJourneyArtifact',
  'QualityJourneyArtifactLink',
  'QualityJourneyAnalysisRevision',
  'QualityJourneyDiscoveryRevision',
  'QualityJourneyScenarioPortfolioRevision',
  'QualityJourneyAutomationMaterialization',
  'QualityJourneyPreparedRuntimeCapsule',
  'QualityJourneyExecutionCycle',
  'QualityJourneyExecutionRerunProposal',
  'QualityJourneyExecutionConsent',
  'QualityJourneyBlocker',
  'TestSuite',
  'TestCase',
])

export function qualityJourneyArtifactMetadataSql(scope: { journeyId: string; targetProjectId: string }) {
  return Prisma.join(
    sources.map(rawSource => {
      const source = {
        identity: 'q.id',
        source: rawSource.kind,
        kindSql: `'${rawSource.kind}'`,
        title: `'${rawSource.kind.replaceAll('_', ' ')}'`,
        artifact: 'q.id',
        revision: 'NULL',
        cycle: 'NULL',
        hash: 'NULL',
        time: 'q.createdAt',
        join: '',
        owner: 'q.journeyId',
        predicate: '1=1',
        ...rawSource,
      }
      return Prisma.sql`
    SELECT ${source.kind} || ':' || ${Prisma.raw(source.identity)} AS entryId,
      ${source.source} AS source, q.id AS recordId,
      ${Prisma.raw(source.kindSql)} AS kind,
      ${Prisma.raw(source.title)} AS title,
      ${Prisma.raw(source.artifact)} AS artifactId,
      ${Prisma.raw(source.revision)} AS revisionId,
      ${Prisma.raw(source.cycle)} AS cycleId,
      ${Prisma.raw(source.hash)} AS contentHash,
      ${Prisma.raw(source.time)} AS createdAt
    FROM ${Prisma.raw(source.table)} q ${Prisma.raw(source.join)}
    JOIN QualityJourney j ON j.id=${Prisma.raw(source.owner)}
    WHERE j.id=${scope.journeyId} AND j.targetProjectId=${scope.targetProjectId}
      AND ${Prisma.raw(source.predicate)}
      ${projectScopedTables.has(source.table) ? Prisma.sql`AND q.targetProjectId=${scope.targetProjectId}` : Prisma.empty}
  `
    }),
    ' UNION ALL ',
  )
}
