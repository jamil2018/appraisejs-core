import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import {
  capsulePreflightResultSchema,
  parseCanonicalCapsuleCommandReceipt,
  parseCanonicalRuntimeCapsuleManifest,
  RuntimeCapsuleRepository,
  resolveRuntimeCapsulePaths,
  runtimeCapsuleDiagnosticV1Schema,
} from '@/lib/runtime-capsule'
import { canonicalRuntimeCapsuleJson, hashRuntimeCapsuleValue } from '@/lib/runtime-capsule/contracts'
import { processManager } from '@/lib/test-run/process-manager'
import { summarizeRunEvidence } from './run-evidence-summary-service'
import { ServiceError } from '@/services/shared/errors'
import { testRunEvidenceLinks } from './test-run-evidence-links'

const ACTIVE_ATTEMPTS = new Set(['STARTING', 'RUNNING'])

function recovery(state: string, preflightStatus: 'ready' | 'blocked', evidenceHealth: string) {
  if (state === 'STARTING' || state === 'RUNNING')
    return { code: 'WAIT_FOR_RUN' as const, tool: 'test_run_read', reason: 'The managed run is still active.' }
  if (preflightStatus === 'blocked')
    return {
      code: 'RETRY_PREFLIGHT' as const,
      tool: 'test_run_diagnose',
      reason: 'Resolve sealed preflight blockers before retrying.',
    }
  if (state === 'CANCELLED')
    return {
      code: 'RETRY_MANAGED_RUN' as const,
      tool: 'implementation_validation_start',
      reason: 'Create a new managed run when execution should resume.',
    }
  if (state === 'FAILED' || state === 'INTERRUPTED')
    return {
      code: 'RETRY_MANAGED_RUN' as const,
      tool: 'test_run_diagnose',
      reason: 'Review bounded evidence and retry with a new managed run.',
    }
  if (evidenceHealth !== 'valid')
    return {
      code: 'REVIEW_EVIDENCE' as const,
      tool: 'test_run_diagnose',
      reason: 'Review bounded managed evidence blockers.',
    }
  return {
    code: 'RECONCILE_IMPLEMENTATION' as const,
    tool: 'implementation_validation_reconcile',
    reason: 'Reconcile the completed managed run.',
  }
}

function attemptBlocker(state: string, processRegistered: boolean) {
  if (state === 'STARTING') return { code: 'ATTEMPT_STARTING' as const, recoveryAction: 'WAIT_FOR_RUN' as const }
  if (state === 'RUNNING' && !processRegistered)
    return { code: 'PROCESS_REGISTRY_MISSING' as const, recoveryAction: 'CONTACT_OPERATOR' as const }
  if (state === 'FAILED') return { code: 'ATTEMPT_FAILED' as const, recoveryAction: 'RETRY_MANAGED_RUN' as const }
  if (state === 'INTERRUPTED')
    return { code: 'ATTEMPT_INTERRUPTED' as const, recoveryAction: 'RETRY_MANAGED_RUN' as const }
  if (state === 'CANCELLED') return { code: 'ATTEMPT_CANCELLED' as const, recoveryAction: 'RETRY_MANAGED_RUN' as const }
  return null
}

export async function readRuntimeCapsuleDiagnostic(
  input: { runId: string; expectedTargetProjectId?: string },
  client: PrismaClient = prisma,
  appraiseRoot = path.join(process.cwd(), '.appraise'),
) {
  const run = await client.testRun.findUniqueOrThrow({
    where: { runId: input.runId },
    include: { runtimeCapsule: { include: { executionAttempt: true } }, testCases: true },
  })
  const capsule = run.runtimeCapsule
  const attempt = capsule?.executionAttempt
  if (
    !capsule ||
    !attempt ||
    !run.targetProjectId ||
    (input.expectedTargetProjectId && input.expectedTargetProjectId !== run.targetProjectId)
  )
    throw new ServiceError('Managed runtime capsule diagnostic was not found.', 'NOT_FOUND')
  const identity = { projectId: run.targetProjectId, validationHash: capsule.validationHash, runId: run.runId }
  if (
    (await new RuntimeCapsuleRepository(client, appraiseRoot).inspect({ ...identity, testRunId: run.id })) !== 'ready'
  )
    throw new ServiceError('Managed runtime capsule integrity is not ready.', 'CONFLICT')
  const manifest = parseCanonicalRuntimeCapsuleManifest(capsule.manifestJson)
  const paths = resolveRuntimeCapsulePaths({ appraiseRoot, ...identity })
  const receipt = parseCanonicalCapsuleCommandReceipt(
    await fs.readFile(path.join(paths.capsuleRoot, manifest.commandReceipt.path), 'utf8'),
  )
  const preflight = capsulePreflightResultSchema.parse(JSON.parse(attempt.preflightResultJson))
  if (
    attempt.receiptHash !== manifest.commandReceipt.hash ||
    canonicalRuntimeCapsuleJson(preflight) !== attempt.preflightResultJson ||
    hashRuntimeCapsuleValue(preflight) !== attempt.preflightResultHash ||
    attempt.preflightCheckedAt.toISOString() !== preflight.checkedAt
  )
    throw new ServiceError('Managed runtime capsule diagnostic identity is invalid.', 'CONFLICT')
  const evidence = await summarizeRunEvidence(run.runId, client, appraiseRoot)
  const active = ACTIVE_ATTEMPTS.has(attempt.state)
  const processRegistered = processManager.has(run.runId)
  const stateBlocker = attemptBlocker(attempt.state, processRegistered)
  const nextRecoveryAction = recovery(attempt.state, preflight.status, evidence.evidenceHealth)
  const evidenceLinks = testRunEvidenceLinks(run.runId, run.targetProjectId)
  return runtimeCapsuleDiagnosticV1Schema.parse({
    schemaVersion: '1',
    run: {
      runId: run.runId,
      testRunStatus: run.status,
      result: run.result,
      evidenceHealth: evidence.evidenceHealth,
      active,
      processRegistered,
      startedAt: run.startedAt.toISOString(),
      ...(run.completedAt ? { completedAt: run.completedAt.toISOString() } : {}),
    },
    ownership: {
      targetProjectId: run.targetProjectId,
      planId: run.planId,
      validationHash: capsule.validationHash,
      capsuleHash: capsule.capsuleHash,
      commandReceiptHash: attempt.receiptHash,
      attemptId: attempt.id,
    },
    attempt: {
      state: attempt.state,
      active,
      ...(attempt.startedAt ? { startedAt: attempt.startedAt.toISOString() } : {}),
      ...(attempt.completedAt ? { completedAt: attempt.completedAt.toISOString() } : {}),
    },
    command: {
      sealed: true,
      receiptKind: receipt.receiptKind,
      executionProfile: receipt.command.config.executionProfile,
      preflightProfile: receipt.command.config.preflightProfile,
      browser: receipt.selection.browser,
      expectedCaseCount: receipt.selection.expectedCaseCount,
    },
    identities: {
      node: {
        version: receipt.runtime.node.version,
        platform: receipt.runtime.node.platform,
        arch: receipt.runtime.node.arch,
        contentHash: receipt.runtime.node.hash,
      },
      cucumber: {
        packageName: '@cucumber/cucumber',
        version: receipt.runtime.cucumber.version,
        contentHash: receipt.runtime.cucumber.hash,
        singletonKey: receipt.runtime.cucumber.singletonKey,
      },
      appraiseRuntime: {
        packageName: '@appraise/cucumber-runtime',
        version: receipt.runtime.appraiseRuntime.version,
        contentHash: receipt.runtime.appraiseRuntime.hash,
      },
      compiler: receipt.runtime.compiler,
    },
    preflight: {
      status: preflight.status,
      checkedAt: preflight.checkedAt,
      checks: preflight.checks.map(({ stage, status, code }) => ({ stage, status, code })),
      ...(preflight.resolved.selectedScenarioCount === undefined
        ? {}
        : { selectedScenarioCount: preflight.resolved.selectedScenarioCount }),
    },
    blockers: [
      ...(stateBlocker ? [stateBlocker] : []),
      ...preflight.blockers.map(blocker => ({ code: blocker.code, recoveryAction: 'RETRY_PREFLIGHT' as const })),
    ].slice(0, 16),
    evidence: {
      expectedCaseCount: evidence.counts.expectedTestCases,
      matchedCaseCount: evidence.counts.matchedScenarios,
      scenarioCount: evidence.counts.scenarios,
      failureSignatures: evidence.failureSignatures,
      links: {
        run: evidenceLinks.reportUrl,
        logs: evidenceLinks.logsUrl,
        ...(run.reportPath ? { report: evidenceLinks.reportUrl } : {}),
      },
    },
    nextRecoveryAction,
  })
}
