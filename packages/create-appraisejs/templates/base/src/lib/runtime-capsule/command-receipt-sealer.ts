import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { ValidationAstRuntimeInput } from '@/lib/quality-design/validation-runtime-input-contract'
import { capsuleCommandReceiptV1Schema } from './command-receipt-contract'
import { hashRuntimeCapsuleBytes } from './contracts'
import { resolveCapsuleRuntimeIdentity } from './runtime-identity'
import { buildCapsuleExecutionArgv, buildCapsulePreflightArgv } from './command-argv'

const runtimeRequire = createRequire(path.join(process.cwd(), 'package.json'))
const APPRAISE_RUNTIME_PATH = path.resolve(process.cwd(), 'packages/cucumber-runtime/dist/index.js')
const APPRAISE_HOOKS_PATH = path.resolve(process.cwd(), 'packages/cucumber-runtime/dist/hooks.js')

type BuiltCapsuleFiles = {
  files: Array<{ path: string; role: string; bytes: Buffer }>
  cases: Array<{ validationId: string; suiteId: string; caseId: string; scenarioId: string }>
}

function canonicalCapsuleBaseUrl(value: string) {
  const parsed = new URL(value)
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
    throw new Error('APPRAISE_BASE_URL must be a credential-free HTTP(S) URL.')
  return parsed.toString()
}

function buildCapsuleSelectionTagExpression(cases: BuiltCapsuleFiles['cases']) {
  return cases
    .map(item => `(@appraise_validation_${item.validationId} and @ts_${item.suiteId} and @tc_${item.caseId})`)
    .join(' or ')
}

export function sealCredentialEnvironment(input: {
  credentialState: 'NONE' | 'REFERENCE_CONFIGURED'
  passwordReference: string | null
  resolvedPassword: string | undefined
}) {
  if (input.credentialState === 'NONE') {
    if (input.passwordReference !== null || input.resolvedPassword !== undefined)
      throw new Error('Runtime capsule credential state and reference are inconsistent.')
    return undefined
  }
  if (!input.passwordReference || !input.resolvedPassword)
    throw new Error('Runtime capsule environment credential reference is unavailable.')
  return {
    key: 'APPRAISE_ENV_PASSWORD',
    source: 'environment-ref' as const,
    reference: input.passwordReference,
    referenceKind: 'environment' as const,
    referenceVersion: hashRuntimeCapsuleBytes(Buffer.from(input.passwordReference)),
    expectedDigest: hashRuntimeCapsuleBytes(Buffer.from(input.resolvedPassword)),
  }
}

export async function sealCapsuleCommandReceipt(input: {
  operation: {
    id: string
    sourceKind?: 'PUBLISHED_VALIDATION' | 'AUTHORED_TEST_SNAPSHOT'
    sourceHash?: string
    operationHash: string
    projectionHash: string
    receiptHash: string
    runtimeInputHash: string
    targetProjectId: string
    validationHash: string
  }
  testRun: {
    id: string
    runId: string
    browserEngine: 'CHROMIUM' | 'FIREFOX' | 'WEBKIT'
    environment: {
      id: string
      name: string
      baseUrl: string
      username: string | null
      passwordEnvironmentVariable: string | null
      credentialState: 'NONE' | 'REFERENCE_CONFIGURED'
    }
  }
  runtimeInput: ValidationAstRuntimeInput
  built: BuiltCapsuleFiles
}) {
  const cucumberModulePath = runtimeRequire.resolve('@cucumber/cucumber')
  const cucumberBinaryPath = path.resolve(path.dirname(cucumberModulePath), '../bin/cucumber.js')
  const runtime = await resolveCapsuleRuntimeIdentity({
    cucumberBinaryPath,
    cucumberModulePath,
    appraiseRuntimeModulePath: APPRAISE_RUNTIME_PATH,
    appraiseRuntimeHooksPath: APPRAISE_HOOKS_PATH,
  })
  const typescriptPackage = JSON.parse(
    await fs.readFile(runtimeRequire.resolve('typescript/package.json'), 'utf8'),
  ) as {
    version: string
  }
  const fileByPath = new Map(
    input.built.files.map(file => [file.path, { path: file.path, hash: hashRuntimeCapsuleBytes(file.bytes) }]),
  )
  const expectedIdentifierTags = [
    ...new Set(
      input.built.cases.flatMap(item => [
        `@appraise_validation_${item.validationId}`,
        `@ts_${item.suiteId}`,
        `@tc_${item.caseId}`,
      ]),
    ),
  ].sort((left, right) => left.localeCompare(right))
  const tagExpression = buildCapsuleSelectionTagExpression(input.built.cases)
  const browser = input.testRun.browserEngine.toLowerCase() as 'chromium' | 'firefox' | 'webkit'
  const baseUrl = canonicalCapsuleBaseUrl(input.testRun.environment.baseUrl)
  const environmentValues = {
    APPRAISE_BASE_URL: baseUrl,
    BROWSER: browser,
    HEADLESS: 'true',
    REPORT_PATH: 'reports/cucumber.json',
    REPORT_FORMAT: 'json:reports/cucumber.json',
    TEST_RUN_ID: input.testRun.runId,
    ...(input.testRun.environment.username ? { APPRAISE_ENV_USERNAME: input.testRun.environment.username } : {}),
  }
  const passwordReference = input.testRun.environment.passwordEnvironmentVariable
  const password = passwordReference ? process.env[passwordReference] : undefined
  const credentialEntry = sealCredentialEnvironment({
    credentialState: input.testRun.environment.credentialState,
    passwordReference,
    resolvedPassword: password,
  })
  return capsuleCommandReceiptV1Schema.parse({
    schemaVersion: '1',
    receiptKind: 'appraise.capsule-command',
    ownership: {
      targetProjectId: input.operation.targetProjectId,
      validationHash: input.operation.validationHash,
      runId: input.testRun.runId,
      testRunId: input.testRun.id,
      sourceKind: input.operation.sourceKind ?? 'PUBLISHED_VALIDATION',
      sourceHash: input.operation.sourceHash ?? input.operation.validationHash,
      ...(input.operation.sourceKind === 'AUTHORED_TEST_SNAPSHOT' ? {} : { publishOperationId: input.operation.id }),
      operationHash: input.operation.operationHash,
      projectionHash: input.operation.projectionHash,
      compilerReceiptHash: input.operation.receiptHash,
      runtimeInputHash: input.operation.runtimeInputHash,
    },
    runtime: {
      ...runtime,
      loaders: [{ kind: 'native-esm', version: process.versions.modules }],
      compiler: {
        kind: 'precompiled-js',
        typescriptVersion: typescriptPackage.version,
        declarationBundleHash: input.runtimeInput.extensionPolicy.declarationHash,
        extensionCompilerVersion: input.runtimeInput.extensionPolicy.compilerVersion,
      },
      moduleImports: [
        {
          specifier: '@cucumber/cucumber',
          resolvedRealPath: runtime.cucumber.realPath,
          hash: runtime.cucumber.hash,
          packageName: '@cucumber/cucumber',
          version: runtime.cucumber.version,
        },
        {
          specifier: '@appraise/cucumber-runtime/hooks',
          resolvedRealPath: runtime.appraiseHooks.realPath,
          hash: runtime.appraiseHooks.hash,
          packageName: '@appraise/cucumber-runtime',
          version: runtime.appraiseHooks.version,
        },
        {
          specifier: '@appraise/cucumber-runtime',
          resolvedRealPath: runtime.appraiseRuntime.realPath,
          hash: runtime.appraiseRuntime.hash,
          packageName: '@appraise/cucumber-runtime',
          version: runtime.appraiseRuntime.version,
        },
      ],
    },
    command: {
      cwd: '.',
      executable: runtime.node.realPath,
      preflightArgv: buildCapsulePreflightArgv({
        cucumberBinaryPath,
        configPath: 'cucumber.mjs',
        profile: 'preflight',
        tagExpression,
      }),
      executionArgv: buildCapsuleExecutionArgv({
        cucumberBinaryPath,
        configPath: 'cucumber.mjs',
        profile: 'default',
        tagExpression,
      }),
      config: {
        ...fileByPath.get('cucumber.mjs')!,
        executionProfile: 'default',
        preflightProfile: 'preflight',
        shapeVersion: 'profiles-v1',
        reportFormatVersion: 'cucumber-json-v1',
      },
      features: input.built.files.filter(file => file.role === 'feature').map(file => fileByPath.get(file.path)!),
      imports: input.built.files
        .filter(file => ['binding', 'extension'].includes(file.role))
        .map(file => ({ ...fileByPath.get(file.path)!, role: file.role })),
      support: ['support/world.mjs', 'support/hooks.mjs'].map(filePath => fileByPath.get(filePath)!),
    },
    selection: {
      tagExpression,
      browser,
      environmentId: input.testRun.environment.id,
      expectedCases: input.built.cases,
      expectedScenarioCount: input.built.cases.length,
      expectedCaseCount: input.built.cases.length,
      expectedIdentifierTags,
      correlationTagKind: 'case-id',
    },
    environment: {
      allowlist: [...Object.keys(environmentValues), ...(credentialEntry ? [credentialEntry.key] : [])].sort(),
      entries: [
        ...Object.entries(environmentValues).map(([key, value]) => ({
          key,
          source: 'literal' as const,
          value,
          expectedDigest: hashRuntimeCapsuleBytes(Buffer.from(value)),
        })),
        ...(credentialEntry ? [credentialEntry] : []),
      ].sort((left, right) => left.key.localeCompare(right.key)),
    },
    capabilities: {
      network: { mode: 'browser-only', allowedOrigins: [new URL(baseUrl).origin] },
      filesystem: {
        readRoots: ['.'],
        writeRoots: ['reports', 'logs', 'traces', 'screenshots'],
        denySymlinks: true,
      },
      process: { spawn: false, shell: false, childProcess: false },
      imports: {
        allowed: [runtime.cucumber.realPath, runtime.appraiseRuntime.realPath, runtime.appraiseHooks.realPath].sort(),
      },
    },
    outputs: {
      report: { path: 'reports/cucumber.json', format: 'cucumber-json', maxBytes: 10_000_000 },
      log: { path: 'logs/cucumber.log', maxBytes: 10_000_000 },
      evidence: {
        expectedCasesPath: 'expected-cases.json',
        expectedCasesHash: fileByPath.get('expected-cases.json')!.hash,
      },
      artifactEvidence: {
        shapeVersion: 'evidence-subtrees-v1',
        traces: { root: 'traces', suffix: '.zip', maxBytes: 100_000_000 },
        screenshots: { root: 'screenshots', suffix: '.png', maxBytes: 25_000_000 },
      },
      preflight: { path: 'reports/preflight.json', format: 'cucumber-json', maxBytes: 5_000_000 },
    },
    limits: { timeoutMs: 120_000, workers: 1, maxScenarios: input.built.cases.length, maxOutputBytes: 10_000_000 },
  })
}
