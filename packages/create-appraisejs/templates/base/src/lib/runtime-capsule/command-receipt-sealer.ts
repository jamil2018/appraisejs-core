import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { ValidationAstRuntimeInputV1 } from '@/services/coordinator/validation-ast-publish-journal-service'
import { capsuleCommandReceiptV1Schema } from './command-receipt-contract'
import { hashRuntimeCapsuleBytes } from './contracts'
import { resolveCapsuleRuntimeIdentity } from './runtime-identity'
import { buildCapsuleExecutionArgv, buildCapsulePreflightArgv } from './command-argv'

const require = createRequire(import.meta.url)
const APPRAISE_RUNTIME_PATH = path.resolve(process.cwd(), 'packages/cucumber-runtime/dist/index.js')
const APPRAISE_HOOKS_PATH = path.resolve(process.cwd(), 'packages/cucumber-runtime/dist/hooks.js')

type BuiltCapsuleFiles = {
  files: Array<{ path: string; role: string; bytes: Buffer }>
  cases: Array<{ validationId: string; suiteId: string; caseId: string; scenarioId: string }>
}

export function canonicalCapsuleBaseUrl(value: string) {
  const parsed = new URL(value)
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
    throw new Error('APPRAISE_BASE_URL must be a credential-free HTTP(S) URL.')
  return parsed.toString()
}

export function buildCapsuleSelectionTagExpression(cases: BuiltCapsuleFiles['cases']) {
  return cases
    .map(item => `(@appraise_validation_${item.validationId} and @ts_${item.suiteId} and @tc_${item.caseId})`)
    .join(' or ')
}

export async function sealCapsuleCommandReceipt(input: {
  operation: {
    id: string
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
    environment: { id: string; name: string; baseUrl: string }
  }
  runtimeInput: ValidationAstRuntimeInputV1
  built: BuiltCapsuleFiles
}) {
  const cucumberModulePath = require.resolve('@cucumber/cucumber')
  const cucumberBinaryPath = path.resolve(path.dirname(cucumberModulePath), '../bin/cucumber.js')
  const runtime = await resolveCapsuleRuntimeIdentity({
    cucumberBinaryPath,
    cucumberModulePath,
    appraiseRuntimeModulePath: APPRAISE_RUNTIME_PATH,
    appraiseRuntimeHooksPath: APPRAISE_HOOKS_PATH,
  })
  const typescriptPackage = JSON.parse(await fs.readFile(require.resolve('typescript/package.json'), 'utf8')) as {
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
  }
  return capsuleCommandReceiptV1Schema.parse({
    schemaVersion: '1',
    receiptKind: 'appraise.capsule-command',
    ownership: {
      targetProjectId: input.operation.targetProjectId,
      validationHash: input.operation.validationHash,
      runId: input.testRun.runId,
      testRunId: input.testRun.id,
      publishOperationId: input.operation.id,
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
      allowlist: Object.keys(environmentValues).sort(),
      entries: Object.entries(environmentValues)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => ({
          key,
          source: 'literal',
          value,
          expectedDigest: hashRuntimeCapsuleBytes(Buffer.from(value)),
        })),
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
