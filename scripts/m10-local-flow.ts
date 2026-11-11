/** Disposable local verification driver. No provider, production dispatch, or external target. */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { prepareM10AutomationFixture, callM10WorkerMcp } from '../src/test/m10-journey-fixture'
import { registerAppraiseOperations } from '../packages/appraisejs/src/mcp/registry'
import { createQualityJourneyInternalTriageGateway } from '../src/services/coordinator/quality-journey-internal-triage-gateway'
import {
  claimExternalQualityJourneyWork,
  admitExternalQualityJourneyWork,
} from '../src/services/coordinator/quality-journey-service'
import { prepareQualityJourneyTriage } from '../src/services/coordinator/quality-journey-triage-service'
import { reconcileQualityJourneyExecutionRuntime } from '../src/services/coordinator/quality-journey-runtime-service'
import type { TriageInput } from '../src/services/coordinator/quality-journey-triage-input'
import type { QualityJourneyTriageReport } from '../src/lib/quality-journey'

const root = path.resolve('.appraisejs/m10-live')
await fs.mkdir(root, { recursive: true })
const configPath = path.join(root, 'fixture.json')
if (process.argv[2] === 'prepare') {
  await fs.copyFile(configPath, path.join(root, `fixture-retained-${Date.now()}.json`)).catch(error => {
    if (error.code !== 'ENOENT') throw error
  })
  const f = await prepareM10AutomationFixture('http://127.0.0.1:44081/checkout')
  await fs.writeFile(
    configPath,
    JSON.stringify(
      {
        databasePath: f.databasePath,
        workspace: f.workspace,
        scope: f.scope,
        credentials: f.credentials,
        principal: f.principal,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )
  console.log(JSON.stringify({ databasePath: f.databasePath, scope: f.scope, stage: 'EXECUTION' }))
  await f.client.$disconnect()
} else {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'))
  const client = new PrismaClient({ datasources: { db: { url: `file:${config.databasePath}` } } })
  try {
    const { scope, credentials, principal } = config
    const journey = await client.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } })
    if (process.argv[2] === 'inspect') {
      console.log(
        JSON.stringify(
          {
            journey: { id: journey.id, stage: journey.stage, status: journey.status, stateHash: journey.stateHash },
            runs: await client.testRun.findMany({
              select: { id: true, runId: true, status: true, result: true, evidenceHealth: true },
            }),
            consents: await client.qualityJourneyExecutionConsent.findMany({
              select: { id: true, status: true, executionCycleId: true },
            }),
            reports: await client.qualityJourneyTriageReport.findMany({ select: { id: true, contentHash: true } }),
            closure: await client.qualityJourneyClosure.findMany(),
            logs: await client.testRunLog.findMany(),
            attempts: await client.runtimeCapsuleExecutionAttempt.findMany(),
          },
          null,
          2,
        ),
      )
    } else if (process.argv[2] === 'triage') {
      const cycle = await client.qualityJourneyExecutionCycle.findFirstOrThrow({
        where: { journeyId: scope.journeyId, cycleId: journey.activeCycleId },
        orderBy: { startedAt: 'desc' },
      })
      await reconcileQualityJourneyExecutionRuntime({ executionCycleId: cycle.id }, client)
      await prepareQualityJourneyTriage({ ...scope, executionCycleId: cycle.id }, client, credentials)
      const assignmentSecret = `m10-local-${randomUUID()}`
      const claim = await claimExternalQualityJourneyWork(
        { ...credentials, role: 'TRIAGER', principal, assignmentSecret, idempotencyKey: `claim-${randomUUID()}` },
        client,
      )
      const binding = {
        ...credentials,
        role: 'TRIAGER' as const,
        principal,
        assignmentSecret,
        workItemId: claim.workItem.id,
        attemptId: claim.attempt.id,
        assignmentId: claim.assignment.assignmentId,
        assignmentGeneration: claim.assignmentGeneration,
        leaseId: claim.attempt.leaseId,
      }
      await admitExternalQualityJourneyWork({ ...binding, idempotencyKey: `admit-${randomUUID()}` }, client)
      const definitions = registerAppraiseOperations({
        server: { registerTool: () => ({}), registerResource: () => ({}) } as never,
        api: {} as never,
        options: { baseUrl: 'http://127.0.0.1:44080', cwd: process.cwd(), coordinatorId: 'm10-local' },
      })
      const gateway = await createQualityJourneyInternalTriageGateway(binding, definitions, client)
      const version = (await client.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } }))
        .ownershipVersion
      const { result: assignment } = await callM10WorkerMcp<
        TriageInput & { reportRevisionId: string; inputHash: string }
      >(gateway, 'quality_journey_triage_get')
      for (const run of assignment.runs) {
        const { result: page } = await callM10WorkerMcp<{ text: string }>(
          gateway,
          'quality_journey_triage_evidence_read',
          {
            receiptId: run.evidenceReceiptId,
            artifactKind: 'report',
            limit: 65536,
          },
        )
        if (!page.text.length) throw new Error('Empty sealed report read')
      }
      if (
        (await client.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } })).ownershipVersion !== version
      )
        throw new Error('Worker reads changed ownership version')
      const failed = assignment.runs.filter(run => run.evidence.result !== 'PASSED')
      const report: Omit<QualityJourneyTriageReport, 'inputHash'> = {
        schemaVersion: 'appraise.quality-journey/v1',
        reportRevisionId: assignment.reportRevisionId,
        executionCycleId: assignment.executionCycleId,
        cycleId: assignment.cycleId,
        ...(assignment.predecessorReport
          ? { predecessorReportRevisionId: assignment.predecessorReport.reportRevisionId }
          : {}),
        summary: failed.length
          ? 'The synthetic checkout route did not meet the approved route assertion.'
          : 'The synthetic checkout route passed the approved scenario.',
        findings: failed.map((run, index) => ({
          findingId: `finding-${index}`,
          testRunId: run.testRunId,
          evidenceReceiptId: run.evidenceReceiptId,
          scenarioRevisionId: run.scenarioRevisionId,
          requirementIds: ['REQ-M10-CHECKOUT'],
          kind: 'TARGET_DEFECT',
          targetOutcome: 'FAILED',
          confidence: 'HIGH',
          rationale: 'The sealed runtime report records the route assertion failure.',
          competingHypotheses: [],
          unresolved: true,
          postmortem: {
            observation: 'Checkout redirected to /failed.',
            expectedBehavior: 'The checkout route remains /checkout.',
            causalAnalysis: 'The disposable target deliberately redirects checkout.',
            nextAction: 'Correct the synthetic target and request a consent-bound rerun.',
          },
        })),
        coverage: [
          {
            requirementId: 'REQ-M10-CHECKOUT',
            scenarioRevisionIds: assignment.scenarios.map(s => s.revisionId),
            testRunIds: assignment.runs.map(r => r.testRunId),
            outcome: failed.length ? 'UNRESOLVED' : 'PASSED',
            rationale: failed.length
              ? 'Checkout route failed in sealed runtime evidence.'
              : 'Exact approved scenario passed with valid sealed evidence.',
          },
        ],
        residualRisks: [],
        recommendations: [failed.length ? 'Fix the synthetic target and rerun.' : 'Close after human review.'],
      }
      const accepted = await callM10WorkerMcp(gateway, 'quality_journey_triage_submit', {
        idempotencyKey: `report-${randomUUID()}`,
        report,
      })
      console.log(JSON.stringify({ accepted, readsPreservedOwnership: true }))
    } else throw new Error('Expected prepare, inspect, or triage')
  } finally {
    await client.$disconnect()
  }
}
