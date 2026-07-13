import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  canonicalCapsuleCommandReceipt,
  CAPSULE_PREFLIGHT_CHECK_ORDER,
  capsuleCommandReceiptV1Schema,
  capsulePreflightResultSchema,
  hashCapsuleCommandReceipt,
  parseCanonicalCapsuleCommandReceipt,
  resolveCapsuleRuntimeIdentity,
} from './index'

const h = (character: string) => `sha256:${character.repeat(64)}`
const readyChecks = () =>
  CAPSULE_PREFLIGHT_CHECK_ORDER.map((stage, order) => ({
    order,
    stage,
    code: order === CAPSULE_PREFLIGHT_CHECK_ORDER.length - 1 ? ('PREFLIGHT_READY' as const) : ('CHECK_PASSED' as const),
    status: 'passed' as const,
  }))

function receipt() {
  const identity = {
    realPath: '/runtime/module.js',
    hash: h('a'),
    version: '1.0.0',
    packageRootRealPath: '/runtime',
    packageJsonHash: h('b'),
  }
  return {
    schemaVersion: '1',
    receiptKind: 'appraise.capsule-command',
    ownership: {
      targetProjectId: 'project',
      validationHash: h('a'),
      runId: 'run',
      testRunId: 'test-run',
      publishOperationId: 'operation',
      operationHash: h('d'),
      projectionHash: h('e'),
      compilerReceiptHash: h('f'),
      runtimeInputHash: h('1'),
    },
    runtime: {
      node: { realPath: '/usr/bin/node', hash: h('2'), version: 'v24', platform: 'darwin', arch: 'arm64' },
      cucumber: { ...identity, binaryRealPath: '/runtime/bin/cucumber.js', binaryHash: h('3'), singletonKey: h('4') },
      appraiseRuntime: identity,
      appraiseHooks: { ...identity, realPath: '/runtime/hooks.js', hash: h('c') },
      loaders: [{ kind: 'native-esm', version: '1' }],
      compiler: {
        kind: 'precompiled-js',
        typescriptVersion: '5.7.3',
        declarationBundleHash: h('5'),
        extensionCompilerVersion: '1',
      },
      moduleImports: [
        {
          specifier: '@cucumber/cucumber',
          resolvedRealPath: '/runtime/module.js',
          hash: h('a'),
          packageName: '@cucumber/cucumber',
          version: '1.0.0',
        },
        {
          specifier: '@appraise/cucumber-runtime',
          resolvedRealPath: '/runtime/appraise.js',
          hash: h('b'),
          packageName: '@appraise/cucumber-runtime',
          version: '1.0.0',
        },
        {
          specifier: '@appraise/cucumber-runtime/hooks',
          resolvedRealPath: '/runtime/hooks.js',
          hash: h('c'),
          packageName: '@appraise/cucumber-runtime',
          version: '1.0.0',
        },
      ],
    },
    command: {
      cwd: '.',
      executable: '/usr/bin/node',
      preflightArgv: [
        '/runtime/bin/cucumber.js',
        '--config',
        'cucumber.mjs',
        '--profile',
        'preflight',
        '--tags',
        '@tc_case',
        '--dry-run',
      ],
      executionArgv: [
        '/runtime/bin/cucumber.js',
        '--config',
        'cucumber.mjs',
        '--profile',
        'default',
        '--tags',
        '@tc_case',
      ],
      config: {
        path: 'cucumber.mjs',
        hash: h('6'),
        executionProfile: 'default',
        preflightProfile: 'preflight',
        shapeVersion: 'profiles-v1',
        reportFormatVersion: 'cucumber-json-v1',
      },
      features: [{ path: 'features/a.feature', hash: h('7') }],
      imports: [{ path: 'bindings/a.mjs', hash: h('8'), role: 'binding' }],
      support: [],
    },
    selection: {
      tagExpression: '@tc_case',
      browser: 'chromium',
      environmentId: 'local',
      expectedCases: [{ validationId: 'validation', suiteId: 'suite', caseId: 'case', scenarioId: 'scenario' }],
      expectedScenarioCount: 1,
      expectedCaseCount: 1,
      expectedIdentifierTags: ['@appraise_validation_validation', '@tc_case', '@ts_suite'],
      correlationTagKind: 'case-id',
    },
    environment: {
      allowlist: ['APPRAISE_BASE_URL'],
      entries: [{ key: 'APPRAISE_BASE_URL', source: 'literal', value: 'http://localhost', expectedDigest: h('9') }],
    },
    capabilities: {
      network: { mode: 'browser-only', allowedOrigins: ['http://localhost'] },
      filesystem: { readRoots: ['.'], writeRoots: ['reports', 'logs', 'traces', 'screenshots'], denySymlinks: true },
      process: { spawn: false, shell: false, childProcess: false },
      imports: { allowed: ['/runtime/module.js'] },
    },
    outputs: {
      report: { path: 'reports/cucumber.json', format: 'cucumber-json', maxBytes: 1000 },
      log: { path: 'logs/cucumber.log', maxBytes: 1000 },
      evidence: { expectedCasesPath: 'expected-cases.json', expectedCasesHash: h('a') },
      artifactEvidence: {
        shapeVersion: 'evidence-subtrees-v1',
        traces: { root: 'traces', suffix: '.zip', maxBytes: 1000 },
        screenshots: { root: 'screenshots', suffix: '.png', maxBytes: 1000 },
      },
      preflight: { path: 'reports/preflight.json', format: 'cucumber-json', maxBytes: 1000 },
    },
    limits: { timeoutMs: 30_000, workers: 1, maxScenarios: 1, maxOutputBytes: 10_000 },
  } as const
}

describe('capsule command receipt contract', () => {
  it('rejects unresolved project placeholders before a receipt can be reviewed', () => {
    const value = receipt()
    const invalidValue = {
      ...value,
      runtime: {
        ...value.runtime,
        cucumber: {
          ...value.runtime.cucumber,
          binaryRealPath:
            '/Users/jamil/Personal Projects/appraisejs/[project]/node_modules/@cucumber/cucumber/bin/cucumber.js',
        },
      },
    }

    const result = capsuleCommandReceiptV1Schema.safeParse(invalidValue)

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['runtime', 'cucumber', 'binaryRealPath'],
          message: expect.stringContaining('unresolved placeholder'),
        }),
      )
  })

  it('round-trips canonical bytes and hashes deterministically', () => {
    const value = receipt()
    const canonical = canonicalCapsuleCommandReceipt(value)
    expect(parseCanonicalCapsuleCommandReceipt(canonical)).toEqual(value)
    expect(hashCapsuleCommandReceipt(value)).toBe(hashCapsuleCommandReceipt(JSON.parse(canonical)))
    expect(() => parseCanonicalCapsuleCommandReceipt(`${canonical} `)).toThrow(/canonical/)
  })

  it('rejects unsafe argv, environment, paths, count drift, and capability widening', () => {
    expect(
      capsuleCommandReceiptV1Schema.safeParse({ ...receipt(), command: { ...receipt().command, cwd: '..' } }).success,
    ).toBe(false)
    expect(
      capsuleCommandReceiptV1Schema.safeParse({
        ...receipt(),
        command: { ...receipt().command, executionArgv: [...receipt().command.executionArgv, '--dry-run'] },
      }).success,
    ).toBe(false)
    const duplicateCase = {
      ...receipt().selection.expectedCases[0],
      scenarioId: 'scenario-two',
    }
    expect(
      capsuleCommandReceiptV1Schema.safeParse({
        ...receipt(),
        selection: {
          ...receipt().selection,
          expectedCases: [...receipt().selection.expectedCases, duplicateCase],
          expectedCaseCount: 2,
          expectedScenarioCount: 2,
        },
      }).success,
    ).toBe(false)
    const duplicateScenario = {
      ...receipt().selection.expectedCases[0],
      caseId: 'case-two',
    }
    expect(
      capsuleCommandReceiptV1Schema.safeParse({
        ...receipt(),
        selection: {
          ...receipt().selection,
          expectedCases: [...receipt().selection.expectedCases, duplicateScenario],
          expectedCaseCount: 2,
          expectedScenarioCount: 2,
          expectedIdentifierTags: ['@appraise_validation_validation', '@tc_case', '@tc_case-two', '@ts_suite'],
        },
      }).success,
    ).toBe(false)
    expect(
      capsuleCommandReceiptV1Schema.safeParse({
        ...receipt(),
        selection: { ...receipt().selection, expectedIdentifierTags: ['@tc_case', '@ts_suite'] },
      }).success,
    ).toBe(false)
    expect(
      capsuleCommandReceiptV1Schema.safeParse({
        ...receipt(),
        selection: {
          ...receipt().selection,
          expectedIdentifierTags: [...receipt().selection.expectedIdentifierTags, '@tc_extra'],
        },
      }).success,
    ).toBe(false)
    expect(
      capsuleCommandReceiptV1Schema.safeParse({
        ...receipt(),
        selection: {
          ...receipt().selection,
          expectedIdentifierTags: [...receipt().selection.expectedIdentifierTags].reverse(),
        },
      }).success,
    ).toBe(false)
    expect(
      capsuleCommandReceiptV1Schema.safeParse({
        ...receipt(),
        command: {
          ...receipt().command,
          support: [{ path: receipt().command.config.path, hash: h('b') }],
        },
      }).success,
    ).toBe(false)
    expect(
      capsuleCommandReceiptV1Schema.safeParse({
        ...receipt(),
        command: {
          ...receipt().command,
          support: [{ path: 'support/world.mjs', hash: receipt().command.config.hash }],
        },
      }).success,
    ).toBe(false)
    expect(
      capsuleCommandReceiptV1Schema.safeParse({
        ...receipt(),
        environment: {
          allowlist: ['NODE_OPTIONS'],
          entries: [{ key: 'NODE_OPTIONS', source: 'literal', value: '--import=x', expectedDigest: h('a') }],
        },
      }).success,
    ).toBe(false)
    expect(
      capsuleCommandReceiptV1Schema.safeParse({
        ...receipt(),
        selection: { ...receipt().selection, expectedScenarioCount: 2 },
      }).success,
    ).toBe(false)
    expect(
      capsuleCommandReceiptV1Schema.safeParse({
        ...receipt(),
        capabilities: { ...receipt().capabilities, process: { spawn: true, shell: false, childProcess: false } },
      }).success,
    ).toBe(false)
    expect(
      capsuleCommandReceiptV1Schema.safeParse({
        ...receipt(),
        command: { ...receipt().command, executable: '/usr/bin/../bin/node' },
      }).success,
    ).toBe(false)
    expect(
      capsuleCommandReceiptV1Schema.safeParse({
        ...receipt(),
        runtime: {
          ...receipt().runtime,
          appraiseRuntime: { ...receipt().runtime.appraiseRuntime, realPath: '/x\n/y' },
        },
      }).success,
    ).toBe(false)
  })

  it('rejects drift in sealed trace and screenshot evidence subtrees', () => {
    const value = receipt()
    expect(
      capsuleCommandReceiptV1Schema.safeParse({
        ...value,
        outputs: {
          ...value.outputs,
          artifactEvidence: {
            ...value.outputs.artifactEvidence,
            traces: { ...value.outputs.artifactEvidence.traces, root: '../traces' },
          },
        },
      }).success,
    ).toBe(false)
    expect(
      capsuleCommandReceiptV1Schema.safeParse({
        ...value,
        outputs: {
          ...value.outputs,
          artifactEvidence: {
            ...value.outputs.artifactEvidence,
            screenshots: { ...value.outputs.artifactEvidence.screenshots, suffix: '.html' },
          },
        },
      }).success,
    ).toBe(false)
  })

  it('bounds sanitized preflight results', () => {
    const result = {
      schemaVersion: '1',
      receiptHash: h('a'),
      status: 'ready',
      checks: readyChecks(),
      blockers: [],
      resolved: { selectedScenarioCount: 1 },
      checkedAt: new Date().toISOString(),
    } as const
    expect(capsulePreflightResultSchema.parse(result)).toBeTruthy()
    expect(
      capsulePreflightResultSchema.parse({
        ...result,
        resolved: {
          runtimeInputHash: h('b'),
          featurePaths: ['features/notes.feature'],
          importPaths: ['bindings/notes.mjs', 'support/hooks.mjs'],
          tagExpression: '@tc_notes',
          browser: 'chromium',
          environmentId: 'local',
          reportPath: 'reports/cucumber.json',
          selectedScenarioCount: 1,
        },
      }).resolved,
    ).toMatchObject({ runtimeInputHash: h('b'), reportPath: 'reports/cucumber.json' })
    expect(capsulePreflightResultSchema.safeParse({ ...result, checks: result.checks.slice(1) }).success).toBe(false)
    expect(
      capsulePreflightResultSchema.safeParse({ ...result, checks: [...result.checks, result.checks[0]] }).success,
    ).toBe(false)
    expect(capsulePreflightResultSchema.safeParse({ ...result, checks: [...result.checks].reverse() }).success).toBe(
      false,
    )
    expect(
      capsulePreflightResultSchema.safeParse({
        ...result,
        checks: result.checks.map((check, index) => (index === 2 ? { ...check, status: 'failed' as const } : check)),
      }).success,
    ).toBe(false)
    const blockedChecks = readyChecks().map((check, index) =>
      index < 4
        ? check
        : index === 4
          ? { ...check, code: 'NODE_IDENTITY_DRIFT' as const, status: 'failed' as const }
          : { ...check, code: 'CHECK_PASSED' as const, status: 'skipped' as const },
    )
    expect(
      capsulePreflightResultSchema.safeParse({
        ...result,
        status: 'blocked',
        checks: blockedChecks,
        blockers: [{ code: 'NODE_IDENTITY_DRIFT', recoveryAction: 'Re-seal the capsule.' }],
      }).success,
    ).toBe(true)
    expect(
      capsulePreflightResultSchema.safeParse({ ...result, status: 'blocked', checks: blockedChecks, blockers: [] })
        .success,
    ).toBe(false)
  })
})

const workspaces: string[] = []
afterEach(async () => Promise.all(workspaces.splice(0).map(value => fs.rm(value, { recursive: true, force: true }))))

function resolveTestRuntimeIdentity(
  cucumber: string,
  appraise: string,
  overrides: Partial<Parameters<typeof resolveCapsuleRuntimeIdentity>[0]> = {},
) {
  return resolveCapsuleRuntimeIdentity({
    nodeExecutable: process.execPath,
    cucumberBinaryPath: path.join(cucumber, 'bin', 'cli.js'),
    cucumberModulePath: path.join(cucumber, 'index.js'),
    appraiseRuntimeModulePath: path.join(appraise, 'index.js'),
    appraiseRuntimeHooksPath: path.join(appraise, 'hooks.js'),
    ...overrides,
  })
}

describe('capsule runtime identity', () => {
  it('hashes physical identities and rejects a second Cucumber package root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-identity-'))
    workspaces.push(root)
    const makePackage = async (folderName: string, packageName: string) => {
      const folder = path.join(root, folderName)
      await fs.mkdir(path.join(folder, 'bin'), { recursive: true })
      await fs.writeFile(path.join(folder, 'package.json'), JSON.stringify({ name: packageName, version: '1.0.0' }))
      await fs.writeFile(path.join(folder, 'index.js'), `export const name='${packageName}'`)
      await fs.writeFile(path.join(folder, 'hooks.js'), 'export {}')
      await fs.writeFile(path.join(folder, 'bin', 'cli.js'), 'export {}')
      return folder
    }
    const cucumber = await makePackage('cucumber', '@cucumber/cucumber')
    const appraise = await makePackage('appraise-runtime', '@appraise/cucumber-runtime')
    const first = await resolveTestRuntimeIdentity(cucumber, appraise)
    expect(first.cucumber.packageRootRealPath).toBe(await fs.realpath(cucumber))
    await fs.writeFile(path.join(cucumber, 'index.js'), 'export const changed=true')
    const changed = await resolveTestRuntimeIdentity(cucumber, appraise)
    expect(changed.cucumber.hash).not.toBe(first.cucumber.hash)
    await expect(
      resolveTestRuntimeIdentity(cucumber, appraise, {
        nodeExecutable: path.join(cucumber, 'bin', 'cli.js'),
      }),
    ).rejects.toThrow(/current Appraise Node/)
    await fs.writeFile(
      path.join(appraise, 'package.json'),
      JSON.stringify({ name: '@impostor/cucumber-runtime', version: '1.0.0' }),
    )
    await expect(resolveTestRuntimeIdentity(cucumber, appraise)).rejects.toThrow(/package identity/)
    await fs.writeFile(
      path.join(appraise, 'package.json'),
      JSON.stringify({ name: '@appraise/cucumber-runtime', version: '1.0.0' }),
    )
    await fs.writeFile(
      path.join(cucumber, 'package.json'),
      JSON.stringify({ name: '@impostor/cucumber', version: '1.0.0' }),
    )
    await expect(resolveTestRuntimeIdentity(cucumber, appraise)).rejects.toThrow(/package identity/)
    await fs.writeFile(
      path.join(cucumber, 'package.json'),
      JSON.stringify({ name: '@cucumber/cucumber', version: '1.0.0' }),
    )
    const second = await makePackage('second-cucumber', '@cucumber/cucumber')
    await expect(
      resolveTestRuntimeIdentity(cucumber, appraise, {
        additionalCucumberModulePaths: [path.join(second, 'index.js')],
      }),
    ).rejects.toThrow(/more than one/)
  })
})
