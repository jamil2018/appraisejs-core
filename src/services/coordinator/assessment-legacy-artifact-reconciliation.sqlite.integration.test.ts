import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'

import { reconcileQualityAssessment, setAssessmentExecutionClientForTests } from './assessment-execution-service'
import { readQualityAssessment } from './quality-design-service'

const workspaces: string[] = []

afterEach(async () => {
  setAssessmentExecutionClientForTests()
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

describe('legacy remote artifact reconciliation', () => {
  it('keeps an unsealed remote TestRun inconclusive and not evaluated without a receipt', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-legacy-remote-artifact-'))
    workspaces.push(workspace)
    const databasePath = path.join(workspace, 'appraise.db')
    await copyMigratedTestDatabase(databasePath)
    const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
    try {
      await client.targetProject.create({
        data: {
          id: 'target-legacy-remote',
          kind: 'REMOTE_BLACK_BOX',
          canonicalIdentity: 'remote:https://fixture.test',
          normalizedRemoteOrigin: 'https://fixture.test',
          displayName: 'Legacy remote artifact fixture',
          fingerprint: `sha256:${'a'.repeat(64)}`,
        },
      })
      await client.environment.create({
        data: {
          id: 'environment-legacy-remote',
          targetProjectId: 'target-legacy-remote',
          name: 'Fixture',
          baseUrl: 'https://fixture.test',
        },
      })
      await client.qualityPlan.create({
        data: { id: 'plan-legacy-remote', targetProjectId: 'target-legacy-remote', title: 'Legacy remote artifact' },
      })
      await client.qualityPlanRevision.create({
        data: {
          id: 'revision-legacy-remote',
          targetProjectId: 'target-legacy-remote',
          qualityPlanId: 'plan-legacy-remote',
          revision: 1,
          status: 'REALIZED',
          contentHash: `sha256:${'b'.repeat(64)}`,
          sourceSpecification: '{}',
          requirementGraphJson: '{}',
        },
      })
      await client.requirementAnalysisRevision.create({
        data: {
          id: 'analysis-legacy-remote',
          targetProjectId: 'target-legacy-remote',
          qualityPlanRevisionId: 'revision-legacy-remote',
          revision: 1,
          status: 'APPROVED',
          decision: 'APPROVED',
          analysisJson: '{}',
          provenanceJson: '{}',
          analysisHash: `sha256:${'d'.repeat(64)}`,
          approvedAt: new Date(),
          approvedBy: 'fixture',
          approvalHash: `sha256:${'e'.repeat(64)}`,
        },
      })
      await client.validationDesignRevision.create({
        data: {
          id: 'design-legacy-remote',
          targetProjectId: 'target-legacy-remote',
          qualityPlanRevisionId: 'revision-legacy-remote',
          requirementAnalysisRevisionId: 'analysis-legacy-remote',
          revision: 1,
          status: 'APPROVED',
          decision: 'APPROVED',
          strategyJson: '{}',
          scenarioPortfolioJson: '{}',
          provenanceJson: '{}',
          designHash: `sha256:${'f'.repeat(64)}`,
          approvedAt: new Date(),
          approvedBy: 'fixture',
          approvalHash: `sha256:${'g'.repeat(64)}`,
        },
      })
      await client.validationVersion.create({
        data: {
          id: 'validation-legacy-remote',
          targetProjectId: 'target-legacy-remote',
          qualityPlanRevisionId: 'revision-legacy-remote',
          validationDesignRevisionId: 'design-legacy-remote',
          validationIdentity: 'legacy remote artifact',
          version: 1,
          status: 'PUBLISHED',
          canonicalAstJson: JSON.stringify({ requiredMinimumAssurance: 'STANDARD' }),
          canonicalHash: `sha256:${'c'.repeat(64)}`,
        },
      })
      await client.evaluationSubjectRevision.create({
        data: {
          id: 'subject-legacy-artifact',
          subjectDigest: `sha256:${'d'.repeat(64)}`,
          subjectKind: 'ARTIFACT',
          authority: 'fixture',
        },
      })
      await client.assessment.create({
        data: {
          id: 'assessment-legacy-artifact',
          targetProjectId: 'target-legacy-remote',
          qualityPlanId: 'plan-legacy-remote',
          qualityPlanRevisionId: 'revision-legacy-remote',
          evaluationSubjectRevisionId: 'subject-legacy-artifact',
          status: 'RUNNING',
          alignment: 'CURRENT',
          lineageId: 'assessment-legacy-artifact',
          generation: 0,
        },
      })
      await client.testRun.create({
        data: {
          id: 'test-run-legacy-artifact',
          name: 'legacy remote artifact',
          runId: 'run-legacy-artifact',
          targetProjectId: 'target-legacy-remote',
          environmentId: 'environment-legacy-remote',
          status: 'COMPLETED',
          result: 'PASSED',
          intent: 'ASSESSMENT',
          evidenceHealth: 'valid',
          completedAt: new Date('2026-08-22T00:00:00.000Z'),
          // Deliberately absent: legacy ARTIFACT subjects must not bypass the
          // TestRun-owned remote packet requirement during reconciliation.
          environmentSnapshotHash: null,
          environmentSnapshotJson: null,
          environmentSnapshotVersion: null,
        },
      })
      await client.assessmentRun.create({
        data: {
          id: 'assessment-run-legacy-artifact',
          targetProjectId: 'target-legacy-remote',
          assessmentId: 'assessment-legacy-artifact',
          qualityPlanRevisionId: 'revision-legacy-remote',
          evaluationSubjectRevisionId: 'subject-legacy-artifact',
          idempotencyScope: 'legacy-remote-artifact',
          idempotencyKey: 'legacy-remote-artifact',
          requestHash: `sha256:${'e'.repeat(64)}`,
          status: 'PREPARED',
        },
      })
      await client.assessmentRunBinding.create({
        data: {
          id: 'binding-legacy-artifact',
          assessmentRunId: 'assessment-run-legacy-artifact',
          validationVersionId: 'validation-legacy-remote',
          resultMatrixCell: 'CHROMIUM:environment-legacy-remote',
          testRunId: 'test-run-legacy-artifact',
          runtimeInputHash: `sha256:${'f'.repeat(64)}`,
        },
      })

      setAssessmentExecutionClientForTests(client)
      await reconcileQualityAssessment({ assessmentId: 'assessment-legacy-artifact' })

      expect(
        await client.assessmentRunBinding.findUniqueOrThrow({ where: { id: 'binding-legacy-artifact' } }),
      ).toMatchObject({ terminalOutcome: 'INCONCLUSIVE', evidenceReceiptId: null })
      expect(await client.evidenceReceipt.count({ where: { assessmentId: 'assessment-legacy-artifact' } })).toBe(0)
      // The service read-model type models its post-include records rather
      // than Prisma's generic delegates. This is the deliberate real-client
      // injection boundary for the integration regression.
      const review = await readQualityAssessment(
        'assessment-legacy-artifact',
        client as unknown as Parameters<typeof readQualityAssessment>[1],
      )
      expect(review).toMatchObject({
        assessment: { status: 'CANCELLED' },
        evidenceReceiptCount: 0,
        targetOutcome: 'not_evaluated',
      })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)
})
