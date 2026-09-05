import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'

import prisma from '../src/config/db-config'
import { hashQualityJourneyExecutionValue as hash } from '../src/lib/quality-journey'
import { createQualityJourney } from '../src/services/coordinator/quality-journey-service'

const digest = (character: string) => `sha256:${character.repeat(64)}`

async function seedTriageReport() {
  const targetProjectId = randomUUID()
  const environmentId = `environment-${targetProjectId}`
  const executionCycleId = `execution-${targetProjectId}`
  const workItemId = `work-${targetProjectId}`
  const assignmentId = `assignment-${targetProjectId}`
  const reportRevisionId = `report-${targetProjectId}`

  await prisma.targetProject.create({
    data: {
      id: targetProjectId,
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `e2e-triage:${targetProjectId}`,
      canonicalPath: `/tmp/${targetProjectId}`,
      displayName: 'Journey triage browser test',
      fingerprint: hash(targetProjectId),
    },
  })
  await prisma.environment.create({
    data: { id: environmentId, targetProjectId, name: 'triage local', baseUrl: 'https://example.test' },
  })
  const created = await createQualityJourney({
    targetProjectId,
    idempotencyKey: `create-${targetProjectId}`,
    requirement: { objective: 'Render an immutable triage report.' },
  })
  const journeyId = created.journey.journeyId
  const cycleId = created.journey.activeCycleId
  const input = {
    journeyId,
    targetProjectId,
    executionCycleId,
    cycleId,
    analysis: {
      artifactId: 'analysis-e2e',
      revisionId: 'analysis-e2e-r1',
      contentHash: digest('b'),
      content: { requirements: [{ requirementId: 'REQ-E2E', statement: 'A triage report is visible.' }] },
    },
    scenarios: [
      {
        artifactId: 'scenario-e2e',
        revisionId: 'scenario-e2e-r1',
        contentHash: digest('c'),
        intent: { requirementIds: ['REQ-E2E'] },
      },
    ],
    runs: [
      {
        testRunId: 'test-run-e2e',
        runId: 'run-e2e',
        scenarioRevisionId: 'scenario-e2e-r1',
        evidenceReceiptId: 'receipt-e2e',
        receiptHash: digest('d'),
        evidence: { result: 'FAILED', status: 'COMPLETED', evidenceHealth: 'valid', missingArtifacts: [] },
      },
    ],
  }
  const inputHash = hash(input)
  const report = {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    reportRevisionId,
    executionCycleId,
    cycleId,
    inputHash,
    summary: 'The immutable evidence identifies an automation checkout defect.',
    findings: [
      {
        findingId: 'finding-e2e',
        testRunId: 'test-run-e2e',
        evidenceReceiptId: 'receipt-e2e',
        scenarioRevisionId: 'scenario-e2e-r1',
        requirementIds: ['REQ-E2E'],
        kind: 'VALIDATION_REALIZATION_DEFECT' as const,
        targetOutcome: 'NOT_EVALUATED' as const,
        confidence: 'HIGH' as const,
        rationale: 'The sealed run failed before confirmation.',
        competingHypotheses: [],
        unresolved: false,
        postmortem: {
          observation: 'Confirmation absent.',
          expectedBehavior: 'Confirmation visible.',
          causalAnalysis: 'Target response failed.',
          nextAction: 'Correct checkout and rerun.',
        },
      },
    ],
    coverage: [
      {
        requirementId: 'REQ-E2E',
        scenarioRevisionIds: ['scenario-e2e-r1'],
        testRunIds: ['test-run-e2e'],
        outcome: 'NOT_EVALUATED' as const,
        rationale: 'The exact run is sealed.',
      },
    ],
    residualRisks: ['The correction needs a fresh execution cycle.'],
    recommendations: ['Correct checkout confirmation.'],
    remediation: {
      kind: 'AUTOMATION_CORRECTION' as const,
      findingIds: ['finding-e2e'],
      scenarioRevisionIds: ['scenario-e2e-r1'],
      scope: 'Refresh the checkout automation.',
    },
  }
  const contentHash = hash({ report, source: input })

  await prisma.qualityJourneyExecutionCycle.create({
    data: {
      id: executionCycleId,
      journeyId,
      targetProjectId,
      cycleId,
      preparedCapsulesJson: '[]',
      preparedCapsulesHash: hash([]),
      environmentId,
      environmentSnapshotJson: '{}',
      environmentSnapshotHash: digest('e'),
      environmentSnapshotVersion: 1,
      targetFingerprint: digest('a'),
      stateHash: digest('f'),
      idempotencyKey: `execution-${targetProjectId}`,
      requestHash: digest('1'),
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  })
  await prisma.qualityJourneyWorkItem.create({
    data: {
      id: workItemId,
      journeyId,
      targetProjectId,
      cycleId,
      role: 'TRIAGER',
      status: 'COMPLETED',
      inputHash,
      roleContractDigest: digest('2'),
      inputArtifactRefsJson: '[]',
      allowedOutputsJson: '[]',
      completionCriteriaJson: '[]',
      authorizationScopeJson: '{}',
    },
  })
  await prisma.qualityJourneyTriageAssignment.create({
    data: { id: assignmentId, journeyId, executionCycleId, workItemId, inputHash, inputJson: JSON.stringify(input) },
  })
  await prisma.qualityJourneyTriageReport.create({
    data: {
      id: reportRevisionId,
      journeyId,
      assignmentId,
      contentHash,
      reportJson: JSON.stringify(report),
      idempotencyKey: `report-${targetProjectId}`,
      requestHash: digest('3'),
    },
  })
  await prisma.qualityJourney.update({
    where: { id: journeyId },
    data: { stage: 'REPORT_REVIEW', stateHash: digest('4'), activeTriageReportId: reportRevisionId },
  })
  return { journeyId, targetProjectId }
}

test('Journey triage renders persisted report lineage and full-report revision controls @smoke', async ({
  page,
  context,
  baseURL,
}) => {
  const { journeyId, targetProjectId } = await seedTriageReport()
  await context.addCookies([{ name: 'appraise-active-project', value: targetProjectId, url: baseURL! }])
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))

  await page.goto(`/quality-journeys/${journeyId}?project=${targetProjectId}`)

  await expect(page.getByText('Triage reports', { exact: true })).toBeVisible()
  await expect(page.getByText('sealed receipt')).toBeVisible()
  await expect(page.getByText('The immutable evidence identifies an automation checkout defect.')).toBeVisible()
  await expect(page.getByText('VALIDATION_REALIZATION_DEFECT')).toBeVisible()
  await expect(page.getByLabel('Full report feedback')).toBeVisible()
  await page.getByLabel('Full report feedback').fill('Reassess the complete attribution against the sealed receipt.')
  await expect(page.getByRole('button', { name: 'Request full-report revision' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Approve exact remediation' })).toBeEnabled()
  await page.getByRole('button', { name: 'Request full-report revision' }).click()
  await expect(
    page.getByText('FULL_REPORT_REVISION: Reassess the complete attribution against the sealed receipt.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Request full-report revision' })).toHaveCount(0)
  expect(errors).toEqual([])
})
