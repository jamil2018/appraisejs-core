import { z } from 'zod'
import { CAPSULE_PREFLIGHT_CHECK_ORDER, CAPSULE_PREFLIGHT_FAILURE_CODES } from './command-receipt-contract'
import { runtimeCapsuleHashSchema, runtimeCapsuleSegmentSchema } from './contracts'

const bounded = z
  .string()
  .min(1)
  .max(256)
  .refine(value => !/[\0\r\n]/.test(value), 'must be single-line')
const orchestrationCode = z.enum([
  'CAPSULE_NOT_MATERIALIZED',
  'ATTEMPT_NOT_CREATED',
  'ATTEMPT_STARTING',
  'ATTEMPT_INTERRUPTED',
  'ATTEMPT_FAILED',
  'ATTEMPT_CANCELLED',
  'PROCESS_REGISTRY_MISSING',
  'RUN_ASSOCIATION_MISMATCH',
  'invalid_empty_run',
  'invalid_missing_test_cases',
  'invalid_missing_report',
  'invalid_placeholder_binary',
  'invalid_unmatched_scenarios',
  'invalid_stale_runtime',
  'infrastructure_failure',
])
const failureCode = z.union([z.enum(CAPSULE_PREFLIGHT_FAILURE_CODES), orchestrationCode])
const recoveryCode = z.enum([
  'WAIT_FOR_RUN',
  'RETRY_PREFLIGHT',
  'REMATERIALIZE_CAPSULE',
  'RETRY_MANAGED_RUN',
  'CANCEL_ACTIVE_RUN',
  'RECONCILE_BASELINE',
  'RECONCILE_IMPLEMENTATION',
  'REVIEW_EVIDENCE',
  'CONTACT_OPERATOR',
])
const identity = z.object({ version: bounded, contentHash: runtimeCapsuleHashSchema }).strict()

export const runtimeCapsuleDiagnosticV1Schema = z
  .object({
    schemaVersion: z.literal('1'),
    run: z
      .object({
        runId: runtimeCapsuleSegmentSchema,
        testRunStatus: bounded,
        result: bounded,
        evidenceHealth: bounded,
        active: z.boolean(),
        processRegistered: z.boolean(),
        startedAt: z.string().datetime().optional(),
        completedAt: z.string().datetime().optional(),
      })
      .strict(),
    ownership: z
      .object({
        targetProjectId: runtimeCapsuleSegmentSchema,
        planId: bounded.nullable(),
        validationHash: runtimeCapsuleHashSchema,
        capsuleHash: runtimeCapsuleHashSchema,
        commandReceiptHash: runtimeCapsuleHashSchema,
        attemptId: runtimeCapsuleSegmentSchema,
      })
      .strict(),
    attempt: z
      .object({
        state: z.enum(['PREPARED', 'STARTING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED']),
        active: z.boolean(),
        startedAt: z.string().datetime().optional(),
        completedAt: z.string().datetime().optional(),
      })
      .strict(),
    command: z
      .object({
        sealed: z.literal(true),
        receiptKind: z.literal('appraise.capsule-command'),
        executionProfile: z.literal('default'),
        preflightProfile: z.literal('preflight'),
        browser: z.enum(['chromium', 'firefox', 'webkit']),
        expectedCaseCount: z.number().int().nonnegative().max(256),
      })
      .strict(),
    identities: z
      .object({
        node: identity.extend({ platform: bounded, arch: bounded }).strict(),
        cucumber: identity
          .extend({ packageName: z.literal('@cucumber/cucumber'), singletonKey: runtimeCapsuleHashSchema })
          .strict(),
        appraiseRuntime: identity.extend({ packageName: z.literal('@appraise/cucumber-runtime') }).strict(),
        compiler: z
          .object({
            kind: z.literal('precompiled-js'),
            typescriptVersion: bounded,
            declarationBundleHash: runtimeCapsuleHashSchema,
            extensionCompilerVersion: bounded,
          })
          .strict(),
      })
      .strict(),
    preflight: z
      .object({
        status: z.enum(['ready', 'blocked']),
        checkedAt: z.string().datetime(),
        checks: z
          .array(
            z
              .object({
                stage: z.enum(CAPSULE_PREFLIGHT_CHECK_ORDER),
                status: z.enum(['passed', 'failed', 'skipped']),
                code: bounded,
              })
              .strict(),
          )
          .max(13),
        selectedScenarioCount: z.number().int().nonnegative().max(256).optional(),
      })
      .strict(),
    blockers: z
      .array(
        z
          .object({
            code: failureCode,
            stage: z.enum(CAPSULE_PREFLIGHT_CHECK_ORDER).optional(),
            recoveryAction: recoveryCode,
          })
          .strict(),
      )
      .max(16),
    evidence: z
      .object({
        expectedCaseCount: z.number().int().nonnegative(),
        matchedCaseCount: z.number().int().nonnegative(),
        scenarioCount: z.number().int().nonnegative(),
        failureSignatures: z.array(bounded).max(16),
        links: z.object({ run: bounded, logs: bounded, report: bounded.optional() }).strict(),
      })
      .strict(),
    nextRecoveryAction: z.object({ code: recoveryCode, tool: bounded, reason: bounded }).strict(),
  })
  .strict()
