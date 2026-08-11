import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { parse as parseTagExpression } from '@cucumber/tag-expressions'
import {
  CAPSULE_PREFLIGHT_CHECK_ORDER,
  CAPSULE_PREFLIGHT_FAILURE_CODES,
  capsulePreflightResultSchema,
  hashCapsuleCommandReceipt,
  parseCanonicalCapsuleCommandReceipt,
  type CapsuleCommandReceiptV1,
} from './command-receipt-contract'
import { CucumberDryRunReconciliationError, parseAndReconcileCucumberDryRun } from './cucumber-dry-run-report'
import { defaultCapsulePreflightDependencies, type CapsulePreflightDependencies } from './preflight-dependencies'
import { RuntimeCapsuleRepository } from './repository'
import { RuntimeCapsuleLeaseRepository } from './lease-repository'
import { withRuntimeCapsuleLeaseHeartbeat } from './materializer'
import { resolveCapsuleRuntimeIdentity } from './runtime-identity'
import { readCapsuleManifest, resolveRuntimeCapsulePaths, verifyRuntimeCapsuleFile } from './storage'
import {
  expectedConfigSource,
  resolveSealedEnvironment,
  validateCompilerIdentity,
  validateCucumberSingleton,
  validateExpectedCaseEvidence,
  validateRuntimeIdentity,
  validateOperationClosure,
} from './preflight-validators'

const invalidReceiptHash = `sha256:${'0'.repeat(64)}`
const MAX_DIAGNOSTIC_LINES = 8
const MAX_DIAGNOSTIC_LINE_LENGTH = 256

class PreflightFailure extends Error {
  constructor(
    readonly code: (typeof CAPSULE_PREFLIGHT_FAILURE_CODES)[number],
    readonly recoveryAction: string,
    readonly filePath?: string,
  ) {
    super(code)
  }
}

type PreflightInput = { projectId: string; validationHash: string; testRunId: string; runId: string }

export function boundedProcessOutput(value: string, secrets: string[], capsuleRoot: string) {
  let scrubbed = value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').replaceAll(capsuleRoot, '<capsule>')
  for (const secret of secrets.filter(secret => secret.length >= 3))
    scrubbed = scrubbed.replaceAll(secret, '<redacted>')
  scrubbed = scrubbed.replace(/(?:file:\/\/)?\/(?:[^/\s:'"()[\]{}]+\/)*[^/\s:'"()[\]{}]+/g, '<path>')
  const lines = scrubbed
    .split(/\r?\n/)
    .map(line => line.replace(/[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim())
    .filter(Boolean)
  return {
    lines: lines.slice(0, MAX_DIAGNOSTIC_LINES).map(line => line.slice(0, MAX_DIAGNOSTIC_LINE_LENGTH)),
    truncated: lines.length > MAX_DIAGNOSTIC_LINES || lines.some(line => line.length > MAX_DIAGNOSTIC_LINE_LENGTH),
  }
}

function failedProcessOutput(
  result: { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean },
  env: Record<string, string>,
  capsuleRoot: string,
) {
  if (!result.timedOut && result.exitCode === 0) return undefined
  const secrets = Object.values(env)
  const stdout = boundedProcessOutput(result.stdout, secrets, capsuleRoot)
  const stderr = boundedProcessOutput(result.stderr, secrets, capsuleRoot)
  return {
    stdout: stdout.lines,
    stderr: stderr.lines,
    truncated: stdout.truncated || stderr.truncated,
  }
}

function capsuleOwnershipMatches(
  capsule: { targetProjectId: string; validationHash: string; testRun: { runId: string } } | null,
  receipt: CapsuleCommandReceiptV1,
  input: PreflightInput,
) {
  return (
    capsule?.targetProjectId === input.projectId &&
    capsule.validationHash === input.validationHash &&
    capsule.testRun.runId === input.runId &&
    receipt.ownership.targetProjectId === input.projectId &&
    receipt.ownership.validationHash === input.validationHash &&
    receipt.ownership.testRunId === input.testRunId &&
    receipt.ownership.runId === input.runId
  )
}

function publicationMatches(
  operation: {
    id: string
    targetProjectId: string
    projectionHash: string
    receiptHash: string
    runtimeInputHash: string | null
  } | null,
  receipt: CapsuleCommandReceiptV1,
  input: PreflightInput,
) {
  return (
    operation?.id === receipt.ownership.publishOperationId &&
    operation.targetProjectId === input.projectId &&
    operation.projectionHash === receipt.ownership.projectionHash &&
    operation.receiptHash === receipt.ownership.compilerReceiptHash &&
    operation.runtimeInputHash === receipt.ownership.runtimeInputHash
  )
}

export class RuntimeCapsulePreflight {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly appraiseRoot: string,
    private readonly dependencies: CapsulePreflightDependencies = defaultCapsulePreflightDependencies,
  ) {}

  async check(input: PreflightInput) {
    return withRuntimeCapsuleLeaseHeartbeat(
      new RuntimeCapsuleLeaseRepository(this.prisma),
      { projectId: input.projectId, validationHash: input.validationHash, runId: input.runId },
      assertOwned => this.checkOwned(input, assertOwned),
    )
  }

  private async checkOwned(input: PreflightInput, assertOwned: () => Promise<void>) {
    const paths = resolveRuntimeCapsulePaths({ appraiseRoot: this.appraiseRoot, ...input })
    let receipt!: CapsuleCommandReceiptV1
    let manifest!: NonNullable<Awaited<ReturnType<typeof readCapsuleManifest>>>
    let env: Record<string, string> = {}
    let selectedScenarioCount: number | undefined
    let failureOutput: { stdout: string[]; stderr: string[]; truncated: boolean } | undefined
    let blocked = false
    const checks: Array<{
      order: number
      stage: (typeof CAPSULE_PREFLIGHT_CHECK_ORDER)[number]
      code: 'CHECK_PASSED' | 'PREFLIGHT_READY' | PreflightFailure['code']
      status: 'passed' | 'failed' | 'skipped'
      detailCode?: string
    }> = []
    const blockers: Array<{ code: PreflightFailure['code']; path?: string; recoveryAction: string }> = []

    const stage = async (order: number, fn: () => Promise<void>) => {
      const name = CAPSULE_PREFLIGHT_CHECK_ORDER[order]!
      if (blocked) {
        checks.push({ order, stage: name, code: 'CHECK_PASSED', status: 'skipped' })
        return
      }
      try {
        await assertOwned()
        await fn()
        checks.push({
          order,
          stage: name,
          code: order === CAPSULE_PREFLIGHT_CHECK_ORDER.length - 1 ? 'PREFLIGHT_READY' : 'CHECK_PASSED',
          status: 'passed',
        })
      } catch (error) {
        const failure =
          error instanceof PreflightFailure
            ? error
            : new PreflightFailure(this.defaultCode(name), `Repair the capsule ${name} contract and reseal it.`)
        blocked = true
        checks.push({ order, stage: name, code: failure.code, status: 'failed' })
        blockers.push({
          code: failure.code,
          ...(failure.filePath ? { path: failure.filePath } : {}),
          recoveryAction: failure.recoveryAction,
        })
      }
    }

    await stage(0, async () => {
      manifest = (await readCapsuleManifest(paths))!
      if (!manifest) throw new PreflightFailure('RECEIPT_INVALID', 'Rematerialize the missing capsule manifest.')
      const receiptBytes = await fs.readFile(path.join(paths.capsuleRoot, manifest.commandReceipt.path))
      try {
        receipt = parseCanonicalCapsuleCommandReceipt(receiptBytes.toString('utf8'))
      } catch {
        throw new PreflightFailure('RECEIPT_INVALID', 'Rematerialize the canonical command receipt.')
      }
      if (hashCapsuleCommandReceipt(receipt) !== manifest.commandReceipt.hash)
        throw new PreflightFailure('RECEIPT_HASH_MISMATCH', 'Reseal the command receipt.')
    })

    await stage(1, async () => {
      const capsule = await this.prisma.runtimeCapsule.findUnique({
        where: { testRunId: input.testRunId },
        include: { testRun: true, targetProject: true },
      })
      if (!capsuleOwnershipMatches(capsule, receipt, input))
        throw new PreflightFailure('OWNERSHIP_MISMATCH', 'Use the capsule owned by this exact project and TestRun.')
      const operation = await this.prisma.qualityValidationPublication.findUnique({
        where: { operationHash: receipt.ownership.operationHash },
      })
      if (!publicationMatches(operation, receipt, input))
        throw new PreflightFailure('PUBLICATION_MISMATCH', 'Reseal from the exact reviewed publication.')
    })

    await stage(2, async () => {
      if ((await new RuntimeCapsuleRepository(this.prisma, this.appraiseRoot).inspect(input)) !== 'ready')
        throw new PreflightFailure('CAPSULE_NOT_READY', 'Repair or rematerialize the immutable capsule.')
    })

    await stage(3, async () => {
      const manifestByPath = new Map(manifest.files.map(file => [file.path, file]))
      const receiptFiles = [
        receipt.command.config,
        ...receipt.command.features,
        ...receipt.command.imports,
        ...receipt.command.support,
        { path: receipt.outputs.evidence.expectedCasesPath, hash: receipt.outputs.evidence.expectedCasesHash },
      ]
      for (const file of receiptFiles) {
        const declared = manifestByPath.get(file.path)
        if (!declared || declared.hash !== file.hash)
          throw new PreflightFailure('FILE_HASH_MISMATCH', 'Rematerialize the sealed file set.', file.path)
        if (
          (await verifyRuntimeCapsuleFile({
            paths,
            filePath: file.path,
            contentHash: declared.hash,
            expectedSize: declared.size,
          })) !== 'ready'
        )
          throw new PreflightFailure('FILE_HASH_MISMATCH', 'Repair the immutable run-local file.', file.path)
        if (((await fs.stat(path.join(paths.capsuleRoot, file.path))).mode & 0o777) !== 0o600)
          throw new PreflightFailure('FILE_MODE_INVALID', 'Restore sealed file mode 0600.', file.path)
      }
    })

    let currentRuntime: Awaited<ReturnType<typeof resolveCapsuleRuntimeIdentity>>
    await stage(4, async () => {
      currentRuntime = await resolveCapsuleRuntimeIdentity({
        nodeExecutable: receipt.command.executable,
        cucumberBinaryPath: receipt.runtime.cucumber.binaryRealPath,
        cucumberModulePath: receipt.runtime.moduleImports.find(item => item.packageName === '@cucumber/cucumber')!
          .resolvedRealPath,
        appraiseRuntimeModulePath: receipt.runtime.moduleImports.find(
          item => item.specifier === '@appraise/cucumber-runtime',
        )!.resolvedRealPath,
        appraiseRuntimeHooksPath: receipt.runtime.moduleImports.find(item => item.specifier.endsWith('/hooks'))!
          .resolvedRealPath,
      })
      try {
        validateRuntimeIdentity(receipt, currentRuntime)
        validateOperationClosure(manifest)
      } catch {
        throw new PreflightFailure('APPRAISE_RUNTIME_DRIFT', 'Restore the sealed Appraise runtime and reseal.')
      }
    })

    await stage(5, async () => {
      try {
        validateCucumberSingleton(receipt, currentRuntime)
      } catch {
        throw new PreflightFailure('CUCUMBER_INSTANCE_CONFLICT', 'Use one sealed physical Cucumber runtime instance.')
      }
    })

    await stage(6, async () => {
      const actualConfig = await fs.readFile(path.join(paths.capsuleRoot, receipt.command.config.path), 'utf8')
      if (actualConfig !== expectedConfigSource(receipt))
        throw new PreflightFailure('CONFIG_SHAPE_MISMATCH', 'Restore the sealed profiles-v1 Cucumber config.')
    })

    await stage(7, async () => {
      try {
        validateCompilerIdentity(receipt)
      } catch {
        throw new PreflightFailure('COMPILER_IDENTITY_DRIFT', 'Restore the sealed native-ESM compiler identity.')
      }
    })

    await stage(8, async () => {
      try {
        env = resolveSealedEnvironment(receipt)
      } catch {
        throw new PreflightFailure('CAPABILITY_DENIED', 'Reseal the bounded runtime capabilities.')
      }
    })

    await stage(9, async () => {
      try {
        parseTagExpression(receipt.selection.tagExpression)
      } catch {
        throw new PreflightFailure('TAG_EXPRESSION_INVALID', 'Reseal a valid exact tag expression.')
      }
      if (receipt.selection.expectedCases.length === 0)
        throw new PreflightFailure('TAG_SELECTION_EMPTY', 'Seal at least one expected case.')
    })

    await stage(10, async () => {
      const evidence = await fs.readFile(path.join(paths.capsuleRoot, receipt.outputs.evidence.expectedCasesPath))
      try {
        validateExpectedCaseEvidence(evidence, receipt)
      } catch {
        throw new PreflightFailure('EXPECTED_CASE_SET_MISMATCH', 'Reseal the exact expected case set.')
      }
    })

    await stage(11, async () => {
      try {
        await this.dependencies.probeOutput(paths.capsuleRoot, receipt.outputs.report.path)
        await this.dependencies.probeOutput(paths.capsuleRoot, receipt.outputs.log.path)
        await this.dependencies.probeOutput(paths.capsuleRoot, receipt.outputs.preflight.path)
      } catch {
        throw new PreflightFailure('REPORT_NOT_WRITABLE', 'Repair capsule report and log directory permissions.')
      }
    })

    await stage(12, async () => {
      await assertOwned()
      if ((await new RuntimeCapsuleRepository(this.prisma, this.appraiseRoot).inspect(input)) !== 'ready')
        throw new PreflightFailure('CAPSULE_NOT_READY', 'Repair the capsule before dry-run spawn.')
      await this.dependencies.prepareOutput(paths.capsuleRoot, receipt.outputs.preflight.path)
      await assertOwned()
      const preflightPath = path.join(paths.capsuleRoot, receipt.outputs.preflight.path)
      const result = await this.dependencies.runProcess({
        executable: receipt.command.executable,
        argv: receipt.command.preflightArgv,
        cwd: paths.capsuleRoot,
        env,
        timeoutMs: receipt.limits.timeoutMs,
        maxOutputBytes: receipt.limits.maxOutputBytes,
      })
      failureOutput = failedProcessOutput(result, env, paths.capsuleRoot)
      if (result.timedOut)
        throw new PreflightFailure('DRY_RUN_TIMEOUT', 'Reduce the bounded dry-run or repair loaders.')
      if (result.exitCode !== 0) throw new PreflightFailure('DRY_RUN_FAILED', 'Repair undefined or ambiguous steps.')
      try {
        selectedScenarioCount = parseAndReconcileCucumberDryRun(
          await fs.readFile(preflightPath),
          receipt.selection,
          receipt.outputs.preflight.maxBytes,
        ).selectedScenarioCount
      } catch (error) {
        if (error instanceof CucumberDryRunReconciliationError && error.kind === 'step-status')
          throw new PreflightFailure('DRY_RUN_FAILED', 'Repair undefined or ambiguous steps.')
        throw new PreflightFailure('EXPECTED_SCENARIO_COUNT_MISMATCH', 'Repair exact dry-run scenario selection.')
      }
    })

    return capsulePreflightResultSchema.parse({
      schemaVersion: '1',
      receiptHash: receipt ? hashCapsuleCommandReceipt(receipt) : invalidReceiptHash,
      status: blocked ? 'blocked' : 'ready',
      checks,
      blockers,
      ...(failureOutput ? { failureOutput } : {}),
      resolved: {
        ...(receipt
          ? {
              runtimeInputHash: receipt.ownership.runtimeInputHash,
              nodeVersion: receipt.runtime.node.version,
              cucumberVersion: receipt.runtime.cucumber.version,
              featurePaths: receipt.command.features.map(file => file.path),
              importPaths: [...receipt.command.imports, ...receipt.command.support].map(file => file.path),
              tagExpression: receipt.selection.tagExpression,
              browser: receipt.selection.browser,
              environmentId: receipt.selection.environmentId,
              reportPath: receipt.outputs.report.path,
            }
          : {}),
        ...(selectedScenarioCount === undefined ? {} : { selectedScenarioCount }),
      },
      checkedAt: this.dependencies.now().toISOString(),
    })
  }

  private defaultCode(stage: (typeof CAPSULE_PREFLIGHT_CHECK_ORDER)[number]): PreflightFailure['code'] {
    return (
      {
        receipt: 'RECEIPT_INVALID',
        ownership: 'OWNERSHIP_MISMATCH',
        manifest: 'MANIFEST_HASH_MISMATCH',
        filesystem: 'FILE_HASH_MISMATCH',
        runtime: 'APPRAISE_RUNTIME_DRIFT',
        'cucumber-singleton': 'CUCUMBER_INSTANCE_CONFLICT',
        config: 'CONFIG_LOAD_FAILED',
        'loader-compiler': 'LOADER_INCOMPATIBLE',
        'environment-capabilities': 'CAPABILITY_DENIED',
        selection: 'TAG_EXPRESSION_INVALID',
        'expected-evidence': 'EXPECTED_CASES_MISSING',
        outputs: 'REPORT_NOT_WRITABLE',
        'dry-run': 'DRY_RUN_FAILED',
      } as const
    )[stage]
  }
}
