import { createHash } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import {
  canonicalRuntimeCapsuleJson,
  runtimeCapsuleFilePathSchema,
  runtimeCapsuleHashSchema,
  runtimeCapsuleSegmentSchema,
} from './contracts'
import { buildCapsuleExecutionArgv, buildCapsulePreflightArgv } from './command-argv'

const boundedText = z
  .string()
  .min(1)
  .max(4096)
  .refine(value => !/[\0\r\n]/.test(value), 'must be single-line text')
const absolutePath = z
  .string()
  .min(1)
  .max(4096)
  .refine(value => !/[\0\r\n\\]/.test(value), 'must be a control-free POSIX path')
  .refine(
    value => value.startsWith('/') && path.posix.normalize(value) === value && !value.includes('//'),
    'must be a normalized absolute POSIX path',
  )
const envKey = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/)
const tagExpression = z
  .string()
  .max(4096)
  .refine(value => !/[\0\r\n]/.test(value), 'must be a single line')
const ALLOWED_ENV_KEYS = new Set([
  'APPRAISE_BASE_URL',
  'BROWSER',
  'HEADLESS',
  'REPORT_PATH',
  'REPORT_FORMAT',
  'TEST_RUN_ID',
])
const identitySchema = z
  .object({
    realPath: absolutePath,
    hash: runtimeCapsuleHashSchema,
    version: boundedText,
    packageRootRealPath: absolutePath.optional(),
    packageJsonHash: runtimeCapsuleHashSchema.optional(),
  })
  .strict()

const fileIdentitySchema = z.object({ path: runtimeCapsuleFilePathSchema, hash: runtimeCapsuleHashSchema }).strict()

export const CAPSULE_PREFLIGHT_CHECK_ORDER = [
  'receipt',
  'ownership',
  'manifest',
  'filesystem',
  'runtime',
  'cucumber-singleton',
  'config',
  'loader-compiler',
  'environment-capabilities',
  'selection',
  'expected-evidence',
  'outputs',
  'dry-run',
] as const
export const CAPSULE_PREFLIGHT_FAILURE_CODES = [
  'RECEIPT_INVALID',
  'RECEIPT_NONCANONICAL',
  'RECEIPT_HASH_MISMATCH',
  'RECEIPT_OVERSIZED',
  'OWNERSHIP_MISMATCH',
  'TEST_RUN_MISMATCH',
  'PUBLICATION_MISMATCH',
  'CAPSULE_NOT_READY',
  'MANIFEST_HASH_MISMATCH',
  'FILE_MISSING',
  'FILE_HASH_MISMATCH',
  'FILE_SIZE_MISMATCH',
  'BLOB_REFERENCE_MISMATCH',
  'PATH_ESCAPE',
  'SYMLINK_REJECTED',
  'FILE_OWNER_INVALID',
  'FILE_MODE_INVALID',
  'NODE_BINARY_MISSING',
  'NODE_IDENTITY_DRIFT',
  'CUCUMBER_BINARY_MISSING',
  'CUCUMBER_IDENTITY_DRIFT',
  'APPRAISE_RUNTIME_DRIFT',
  'CUCUMBER_INSTANCE_CONFLICT',
  'CONFIG_MISSING',
  'CONFIG_HASH_MISMATCH',
  'CONFIG_LOAD_FAILED',
  'CONFIG_SHAPE_MISMATCH',
  'LOADER_MISSING',
  'LOADER_IDENTITY_DRIFT',
  'LOADER_INCOMPATIBLE',
  'COMPILER_IDENTITY_DRIFT',
  'ENV_KEY_DENIED',
  'ENV_REFERENCE_MISSING',
  'ENV_VALUE_DRIFT',
  'CAPABILITY_DENIED',
  'ORIGIN_DENIED',
  'TAG_EXPRESSION_INVALID',
  'TAG_SELECTION_EMPTY',
  'TAG_SELECTION_MISMATCH',
  'EXPECTED_CASES_MISSING',
  'EXPECTED_CASES_HASH_MISMATCH',
  'EXPECTED_CASE_SET_MISMATCH',
  'EXPECTED_SCENARIO_COUNT_MISMATCH',
  'DUPLICATE_SCENARIO',
  'REPORT_PATH_INVALID',
  'LOG_PATH_INVALID',
  'REPORT_NOT_WRITABLE',
  'LOG_NOT_WRITABLE',
  'DRY_RUN_TIMEOUT',
  'DRY_RUN_FAILED',
  'PREFLIGHT_READY',
] as const
const CAPSULE_PREFLIGHT_CHECK_CODES = ['CHECK_PASSED', ...CAPSULE_PREFLIGHT_FAILURE_CODES] as const

export const capsuleCommandReceiptV1Schema = z
  .object({
    schemaVersion: z.literal('1'),
    receiptKind: z.literal('appraise.capsule-command'),
    ownership: z
      .object({
        targetProjectId: runtimeCapsuleSegmentSchema,
        validationHash: runtimeCapsuleHashSchema,
        runId: runtimeCapsuleSegmentSchema,
        testRunId: runtimeCapsuleSegmentSchema,
        publishOperationId: boundedText,
        operationHash: runtimeCapsuleHashSchema,
        projectionHash: runtimeCapsuleHashSchema,
        compilerReceiptHash: runtimeCapsuleHashSchema,
        runtimeInputHash: runtimeCapsuleHashSchema,
      })
      .strict(),
    runtime: z
      .object({
        node: identitySchema.extend({ platform: boundedText, arch: boundedText }).strict(),
        cucumber: identitySchema
          .extend({
            binaryRealPath: absolutePath,
            binaryHash: runtimeCapsuleHashSchema,
            singletonKey: runtimeCapsuleHashSchema,
          })
          .strict(),
        appraiseRuntime: identitySchema,
        appraiseHooks: identitySchema,
        loaders: z.array(z.object({ kind: z.literal('native-esm'), version: boundedText }).strict()).length(1),
        compiler: z
          .object({
            kind: z.literal('precompiled-js'),
            typescriptVersion: boundedText,
            declarationBundleHash: runtimeCapsuleHashSchema,
            extensionCompilerVersion: boundedText,
          })
          .strict(),
        moduleImports: z
          .array(
            z
              .object({
                specifier: boundedText,
                resolvedRealPath: absolutePath,
                hash: runtimeCapsuleHashSchema,
                packageName: z.enum(['@cucumber/cucumber', '@appraise/cucumber-runtime']),
                version: boundedText,
              })
              .strict(),
          )
          .length(3),
      })
      .strict(),
    command: z
      .object({
        cwd: z.literal('.'),
        executable: absolutePath,
        preflightArgv: z.array(boundedText).min(3).max(64),
        executionArgv: z.array(boundedText).min(3).max(64),
        config: fileIdentitySchema
          .extend({
            executionProfile: z.literal('default'),
            preflightProfile: z.literal('preflight'),
            shapeVersion: z.literal('profiles-v1'),
            reportFormatVersion: z.literal('cucumber-json-v1'),
          })
          .strict(),
        features: z.array(fileIdentitySchema).min(1).max(256),
        imports: z
          .array(fileIdentitySchema.extend({ role: z.enum(['binding', 'extension']) }).strict())
          .min(1)
          .max(256),
        support: z.array(fileIdentitySchema).max(32),
      })
      .strict(),
    selection: z
      .object({
        tagExpression,
        browser: z.enum(['chromium', 'firefox', 'webkit']),
        environmentId: runtimeCapsuleSegmentSchema,
        expectedCases: z
          .array(
            z
              .object({
                validationId: runtimeCapsuleSegmentSchema,
                suiteId: runtimeCapsuleSegmentSchema,
                caseId: runtimeCapsuleSegmentSchema,
                scenarioId: runtimeCapsuleSegmentSchema,
              })
              .strict(),
          )
          .min(1)
          .max(256),
        expectedScenarioCount: z.number().int().positive().max(256),
        expectedCaseCount: z.number().int().positive().max(256),
        expectedIdentifierTags: z
          .array(z.string().regex(/^@(?:appraise_validation|ts|tc)_[A-Za-z0-9_-]+$/))
          .min(3)
          .max(768),
        correlationTagKind: z.literal('case-id'),
      })
      .strict(),
    environment: z
      .object({
        allowlist: z.array(envKey).max(32),
        entries: z
          .array(
            z
              .object({
                key: envKey,
                source: z.enum(['literal', 'environment-ref']),
                value: boundedText.optional(),
                reference: runtimeCapsuleSegmentSchema.optional(),
                referenceKind: z.literal('environment').optional(),
                referenceVersion: runtimeCapsuleHashSchema.optional(),
                expectedDigest: runtimeCapsuleHashSchema,
              })
              .strict(),
          )
          .max(32),
      })
      .strict(),
    capabilities: z
      .object({
        network: z
          .object({ mode: z.literal('browser-only'), allowedOrigins: z.array(z.string().url().max(2048)).max(16) })
          .strict(),
        filesystem: z
          .object({
            readRoots: z.tuple([z.literal('.')]),
            writeRoots: z.tuple([
              z.literal('reports'),
              z.literal('logs'),
              z.literal('traces'),
              z.literal('screenshots'),
            ]),
            denySymlinks: z.literal(true),
          })
          .strict(),
        process: z
          .object({ spawn: z.literal(false), shell: z.literal(false), childProcess: z.literal(false) })
          .strict(),
        imports: z.object({ allowed: z.array(absolutePath).max(256) }).strict(),
      })
      .strict(),
    outputs: z
      .object({
        report: z
          .object({
            path: runtimeCapsuleFilePathSchema,
            format: z.literal('cucumber-json'),
            maxBytes: z.number().int().positive().max(100_000_000),
          })
          .strict(),
        log: z
          .object({ path: runtimeCapsuleFilePathSchema, maxBytes: z.number().int().positive().max(100_000_000) })
          .strict(),
        evidence: z
          .object({ expectedCasesPath: runtimeCapsuleFilePathSchema, expectedCasesHash: runtimeCapsuleHashSchema })
          .strict(),
        artifactEvidence: z
          .object({
            shapeVersion: z.literal('evidence-subtrees-v1'),
            traces: z
              .object({
                root: z.literal('traces'),
                suffix: z.literal('.zip'),
                maxBytes: z.number().int().positive().max(100_000_000),
              })
              .strict(),
            screenshots: z
              .object({
                root: z.literal('screenshots'),
                suffix: z.literal('.png'),
                maxBytes: z.number().int().positive().max(25_000_000),
              })
              .strict(),
          })
          .strict(),
        preflight: z
          .object({
            path: z.literal('reports/preflight.json'),
            format: z.literal('cucumber-json'),
            maxBytes: z.number().int().positive().max(10_000_000),
          })
          .strict(),
      })
      .strict(),
    limits: z
      .object({
        timeoutMs: z.number().int().min(1_000).max(600_000),
        workers: z.literal(1),
        maxScenarios: z.number().int().positive().max(256),
        maxOutputBytes: z.number().int().positive().max(100_000_000),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    refineEnvironment(value, context)
    refineSelection(value, context)
    const receiptFiles = [
      { ...value.command.config, role: 'config' },
      ...value.command.features.map(file => ({ ...file, role: 'feature' })),
      ...value.command.imports,
      ...value.command.support.map(file => ({ ...file, role: 'support' })),
    ]
    if (new Set(receiptFiles.map(file => file.path)).size !== receiptFiles.length)
      context.addIssue({
        code: 'custom',
        path: ['command'],
        message: 'config, feature, import, and support paths must be globally unique and disjoint',
      })
    const roleByHash = new Map<string, string>()
    for (const file of receiptFiles) {
      const prior = roleByHash.get(file.hash)
      if (prior && prior !== file.role)
        context.addIssue({
          code: 'custom',
          path: ['command'],
          message: 'one immutable file hash cannot claim conflicting receipt roles',
        })
      roleByHash.set(file.hash, file.role)
    }
    refineCommandAndCapabilities(value, context)
  })

export type CapsuleCommandReceiptV1 = z.infer<typeof capsuleCommandReceiptV1Schema>

function refineEnvironment(value: CapsuleCommandReceiptV1, context: z.RefinementCtx) {
  const denied = new Set(['NODE_OPTIONS', 'NODE_PATH', 'PATH', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES'])
  const allow = new Set(value.environment.allowlist)
  for (const entry of value.environment.entries) {
    if (!allow.has(entry.key) || denied.has(entry.key) || !ALLOWED_ENV_KEYS.has(entry.key))
      context.addIssue({
        code: 'custom',
        path: ['environment', 'entries'],
        message: `environment key ${entry.key} is denied`,
      })
    if (!environmentEntryIsConsistent(entry))
      context.addIssue({
        code: 'custom',
        path: ['environment', 'entries'],
        message: 'environment source payload is inconsistent',
      })
  }
  if (
    new Set(value.environment.allowlist).size !== value.environment.allowlist.length ||
    new Set(value.environment.entries.map(item => item.key)).size !== value.environment.entries.length
  )
    context.addIssue({ code: 'custom', path: ['environment'], message: 'environment keys must be unique' })
}

function environmentEntryIsConsistent(entry: CapsuleCommandReceiptV1['environment']['entries'][number]) {
  const hasReference =
    entry.reference !== undefined && entry.referenceKind === 'environment' && entry.referenceVersion !== undefined
  return (
    (entry.source === 'literal') === (entry.value !== undefined) &&
    (entry.source === 'environment-ref') === hasReference
  )
}

function refineSelection(value: CapsuleCommandReceiptV1, context: z.RefinementCtx) {
  const cases = value.selection.expectedCases
  if (value.selection.expectedCaseCount !== cases.length || value.selection.expectedScenarioCount !== cases.length)
    context.addIssue({ code: 'custom', path: ['selection'], message: 'expected counts must equal expected cases' })
  const identities = cases.map(item => `${item.validationId}/${item.suiteId}/${item.caseId}/${item.scenarioId}`)
  const unique = (items: string[]) => new Set(items).size === items.length
  if (!unique(identities) || !unique(cases.map(item => item.caseId)) || !unique(cases.map(item => item.scenarioId)))
    context.addIssue({
      code: 'custom',
      path: ['selection', 'expectedCases'],
      message: 'expected validation/suite/case/scenario identities must be unique',
    })
  const tags = [
    ...new Set(
      cases.flatMap(item => [`@appraise_validation_${item.validationId}`, `@ts_${item.suiteId}`, `@tc_${item.caseId}`]),
    ),
  ].sort((a, b) => a.localeCompare(b))
  if (canonicalRuntimeCapsuleJson(value.selection.expectedIdentifierTags) !== canonicalRuntimeCapsuleJson(tags))
    context.addIssue({
      code: 'custom',
      path: ['selection', 'expectedIdentifierTags'],
      message: 'identifier tags must exactly equal the canonical set derived from expected cases',
    })
}

function refineCommandAndCapabilities(value: CapsuleCommandReceiptV1, context: z.RefinementCtx) {
  if (!value.command.preflightArgv.includes('--dry-run') || value.command.executionArgv.includes('--dry-run'))
    context.addIssue({ code: 'custom', path: ['command'], message: 'only preflight argv may contain --dry-run' })
  const argvInput = {
    cucumberBinaryPath: value.runtime.cucumber.binaryRealPath,
    configPath: value.command.config.path,
    tagExpression: value.selection.tagExpression,
  }
  const execution = buildCapsuleExecutionArgv({ ...argvInput, profile: value.command.config.executionProfile })
  const preflight = buildCapsulePreflightArgv({ ...argvInput, profile: value.command.config.preflightProfile })
  if (!commandIdentityMatches(value, execution, preflight))
    context.addIssue({
      code: 'custom',
      path: ['command'],
      message: 'command identity and preflight/execution argv must match exactly',
    })
  for (const origin of value.capabilities.network.allowedOrigins) {
    if (!canonicalNetworkOrigin(origin))
      context.addIssue({
        code: 'custom',
        path: ['capabilities', 'network'],
        message: 'allowed origins must be canonical credential-free HTTP origins',
      })
  }
  if (!value.outputs.report.path.startsWith('reports/') || !value.outputs.log.path.startsWith('logs/'))
    context.addIssue({
      code: 'custom',
      path: ['outputs'],
      message: 'outputs must stay in their dedicated capsule directories',
    })
}

function commandIdentityMatches(value: CapsuleCommandReceiptV1, execution: string[], preflight: string[]) {
  return (
    value.command.executable === value.runtime.node.realPath &&
    canonicalRuntimeCapsuleJson(value.command.executionArgv) === canonicalRuntimeCapsuleJson(execution) &&
    canonicalRuntimeCapsuleJson(value.command.preflightArgv) === canonicalRuntimeCapsuleJson(preflight)
  )
}

function canonicalNetworkOrigin(origin: string) {
  const parsed = new URL(origin)
  return (
    ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password && parsed.origin === origin
  )
}

export function canonicalCapsuleCommandReceipt(value: unknown): string {
  return canonicalRuntimeCapsuleJson(capsuleCommandReceiptV1Schema.parse(value))
}

export function hashCapsuleCommandReceipt(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalCapsuleCommandReceipt(value)).digest('hex')}`
}

export function parseCanonicalCapsuleCommandReceipt(value: string): CapsuleCommandReceiptV1 {
  if (Buffer.byteLength(value) > 256 * 1024) throw new Error('Capsule command receipt exceeds 256 KiB.')
  const parsed = capsuleCommandReceiptV1Schema.parse(JSON.parse(value))
  if (canonicalRuntimeCapsuleJson(parsed) !== value) throw new Error('Capsule command receipt is not canonical JSON.')
  return parsed
}

const preflightCodeSchema = z.enum(CAPSULE_PREFLIGHT_CHECK_CODES)
const preflightFailureCodeSchema = z.enum(CAPSULE_PREFLIGHT_FAILURE_CODES)
export const capsulePreflightResultSchema = z
  .object({
    schemaVersion: z.literal('1'),
    receiptHash: runtimeCapsuleHashSchema,
    status: z.enum(['ready', 'blocked']),
    checks: z
      .array(
        z
          .object({
            order: z.number().int().min(0).max(12),
            stage: z.enum(CAPSULE_PREFLIGHT_CHECK_ORDER),
            code: preflightCodeSchema,
            status: z.enum(['passed', 'failed', 'skipped']),
            identity: boundedText.optional(),
            detailCode: boundedText.optional(),
          })
          .strict(),
      )
      .max(64),
    blockers: z
      .array(
        z
          .object({
            code: preflightFailureCodeSchema,
            path: runtimeCapsuleFilePathSchema.optional(),
            recoveryAction: boundedText,
          })
          .strict(),
      )
      .max(32),
    resolved: z
      .object({
        runtimeInputHash: runtimeCapsuleHashSchema.optional(),
        nodeVersion: boundedText.optional(),
        cucumberVersion: boundedText.optional(),
        featurePaths: z.array(runtimeCapsuleFilePathSchema).max(32).optional(),
        importPaths: z.array(runtimeCapsuleFilePathSchema).max(128).optional(),
        tagExpression: tagExpression.optional(),
        browser: z.enum(['chromium', 'firefox', 'webkit']).optional(),
        environmentId: runtimeCapsuleSegmentSchema.optional(),
        reportPath: runtimeCapsuleFilePathSchema.optional(),
        selectedScenarioCount: z.number().int().nonnegative().max(256).optional(),
      })
      .strict(),
    checkedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const check of value.checks)
      if (CAPSULE_PREFLIGHT_CHECK_ORDER[check.order] !== check.stage)
        context.addIssue({
          code: 'custom',
          path: ['checks'],
          message: 'check order must match the canonical stage order',
        })
    if (
      value.checks.length !== CAPSULE_PREFLIGHT_CHECK_ORDER.length ||
      new Set(value.checks.map(check => check.stage)).size !== CAPSULE_PREFLIGHT_CHECK_ORDER.length
    )
      context.addIssue({
        code: 'custom',
        path: ['checks'],
        message: 'every required preflight stage must appear once',
      })
    if (!readyPreflightIsConsistent(value))
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'ready status requires no blockers and a final ready check',
      })
    if (value.status === 'blocked' && !blockedPreflightIsConsistent(value))
      context.addIssue({
        code: 'custom',
        path: ['blockers'],
        message: 'blocked results require matching failed checks',
      })
  })

type PreflightConsistencyInput = z.infer<typeof capsulePreflightResultSchema>

function readyPreflightIsConsistent(value: PreflightConsistencyInput) {
  if ((value.status === 'ready') !== (value.blockers.length === 0)) return false
  if (value.status !== 'ready') return true
  return (
    value.checks.every(check => check.status === 'passed') &&
    value.checks.slice(0, -1).every(check => check.code === 'CHECK_PASSED') &&
    value.checks.at(-1)?.code === 'PREFLIGHT_READY'
  )
}

function blockedPreflightIsConsistent(value: PreflightConsistencyInput) {
  const failedCodes = new Set(value.checks.filter(check => check.status === 'failed').map(check => check.code))
  const blockerCodes = new Set(value.blockers.map(blocker => blocker.code))
  if (failedCodes.size === 0 || value.checks.some(check => check.code === 'PREFLIGHT_READY')) return false
  if (
    value.checks.some(
      check =>
        (check.status === 'passed' && check.code !== 'CHECK_PASSED') ||
        (check.status === 'failed' && check.code === 'CHECK_PASSED'),
    )
  )
    return false
  if ([...failedCodes].some(code => code === 'CHECK_PASSED' || !blockerCodes.has(code))) return false
  return [...blockerCodes].every(code => failedCodes.has(code))
}
