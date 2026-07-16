import { createHash } from 'node:crypto'
import { TestRunResult, TestRunStatus, type PrismaClient } from '@prisma/client'

import { extractCucumberEvidence } from '@/lib/baseline-execution/baseline'
import type { ValidationArtifact } from '@/lib/plan-contract'
import { ServiceError } from '@/services/shared/errors'
import { getTestRunLogsService } from '@/services/test-run/test-run-service'
import { testRunEvidenceLinks } from '@/services/test-run/test-run-evidence-links'
import {
  createTestRunArtifactAccess,
  createTestRunArtifactContext,
} from '@/services/test-run/test-run-artifact-context'
import { summarizeRunEvidence, type TestRunEvidenceHealthValue } from '@/services/test-run/run-evidence-summary-service'

import { readStoredJsonReport } from './coordinator-baseline-service'

export type ImplementationValidationRun = NonNullable<ValidationArtifact['implementation']>['validationRuns'][number]
type ManagedTestRunEvidence = {
  runId: string
  status: TestRunStatus
  result: TestRunResult
  reportPath: string | null
  completedAt: Date | null
  evidenceHealth?: TestRunEvidenceHealthValue
}

function evidenceHash(value: unknown) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function managedInfrastructureFailure(run: ImplementationValidationRun, now: Date) {
  return {
    ...run,
    status: 'infrastructure_failure' as const,
    assurance: 'reduced' as const,
    evidenceSource: 'managed' as const,
    evidenceUrls: run.evidenceUrls,
    completedAt: now.toISOString(),
  }
}

function implementationRunStatus(testRun: ManagedTestRunEvidence) {
  const activeStatuses: TestRunStatus[] = [TestRunStatus.RUNNING, TestRunStatus.QUEUED, TestRunStatus.CANCELLING]
  if (activeStatuses.includes(testRun.status)) {
    return 'running' as const
  }
  if (testRun.evidenceHealth && testRun.evidenceHealth !== 'valid') {
    return testRun.evidenceHealth === 'infrastructure_failure'
      ? ('infrastructure_failure' as const)
      : ('failed' as const)
  }
  if (testRun.result === TestRunResult.PASSED) return 'passed' as const
  if (testRun.result === TestRunResult.CANCELLED) return 'cancelled' as const
  return 'failed' as const
}

async function failureSignatureHash(testRun: ManagedTestRunEvidence, client: PrismaClient, appraiseRoot: string) {
  const capsule = await client.testRun.findUnique({
    where: { runId: testRun.runId },
    select: { runtimeCapsule: { select: { id: true } } },
  })
  const report = capsule?.runtimeCapsule
    ? await createTestRunArtifactAccess(createTestRunArtifactContext(appraiseRoot), client)
        .readText({ runId: testRun.runId, kind: 'report' })
        .then(JSON.parse)
    : await readStoredJsonReport(testRun.reportPath)
  const reportEvidence = extractCucumberEvidence(report)
  const logs = await getTestRunLogsService(testRun.runId, undefined, appraiseRoot, client).catch(() => [])
  const failureText = [
    ...reportEvidence.failureSignatures,
    ...logs.filter(log => log.type === 'stderr').map(log => log.message.trim()),
  ]
    .filter(Boolean)
    .join('\n')
  return failureText ? evidenceHash(failureText) : undefined
}

async function failureSignatureHashForStatus(
  status: ImplementationValidationRun['status'],
  testRun: ManagedTestRunEvidence,
  client: PrismaClient,
  appraiseRoot: string,
) {
  if (status !== 'failed' && status !== 'infrastructure_failure') return undefined
  return failureSignatureHash(testRun, client, appraiseRoot)
}

export async function loadManagedImplementationRun(
  run: ImplementationValidationRun,
  client: PrismaClient,
  now: Date,
  appraiseRoot: string,
) {
  if (!run.testRunId) return managedInfrastructureFailure(run, now)
  const testRun = await client.testRun.findUnique({
    where: { runId: run.testRunId },
    select: { runId: true, targetProjectId: true, status: true, result: true, reportPath: true, completedAt: true },
  })
  if (!testRun) return managedInfrastructureFailure(run, now)

  const evidenceSummary = await summarizeRunEvidence(testRun.runId, client, appraiseRoot)
  const status = implementationRunStatus({ ...testRun, evidenceHealth: evidenceSummary.evidenceHealth })
  const signature = await failureSignatureHashForStatus(status, testRun, client, appraiseRoot)
  if (!testRun.targetProjectId) throw new ServiceError('Managed test run has no target-project ownership.', 'CONFLICT')
  const links = testRunEvidenceLinks(testRun.runId, testRun.targetProjectId)
  return {
    ...run,
    evidenceSource: 'managed' as const,
    assurance:
      status === 'passed' && evidenceSummary.evidenceHealth === 'valid' ? ('full' as const) : ('reduced' as const),
    status,
    testRunId: testRun.runId,
    evidenceUrls: [links.reportUrl, links.logsUrl],
    evidence: { logsUrl: links.logsUrl, reportUrl: links.reportUrl, traceUrls: [], screenshotUrls: [] },
    failureSignatureHash: signature,
    completedAt: status === 'running' ? undefined : (testRun.completedAt ?? now).toISOString(),
  }
}
