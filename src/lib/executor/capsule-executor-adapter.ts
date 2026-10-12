import type { PrismaClient } from '@prisma/client'
import { waitForTask, type SpawnedProcess } from '@/lib/process/task-spawner'
import {
  ensureOwnedProcessGroupExited,
  spawnOwnedProcessGroup,
  stopOwnedProcessGroup,
} from '@/lib/process/owned-process-stop'
import { processManager } from '@/lib/test-run/process-manager'
import {
  hashCapsuleCommandReceipt,
  parseCanonicalCapsuleCommandReceipt,
  resolveSealedEnvironment,
  RuntimeCapsuleLeaseRepository,
  RuntimeCapsuleRepository,
  defaultCapsulePreflightDependencies,
  type CapsuleCommandReceiptV1,
} from '@/lib/runtime-capsule'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { credentialRedactor } from '@/lib/runtime-capsule/secret-redaction'

export type CapsuleExecutionRequest = {
  projectId: string
  validationHash: string
  testRunId: string
  runId: string
  capsuleRoot: string
  receiptHash: string
}

export class CapsuleExecutorAdapter {
  private readonly ownedProcesses = new Map<string, SpawnedProcess>()

  constructor(
    private readonly prisma: PrismaClient,
    private readonly appraiseRoot: string,
  ) {}

  async execute(input: CapsuleExecutionRequest): Promise<{ process: SpawnedProcess; reportPath: string }> {
    const receipt = parseCanonicalCapsuleCommandReceipt(
      await fs.readFile(path.join(input.capsuleRoot, 'command-receipt.json'), 'utf8'),
    )
    this.assertReceipt(input, receipt)
    const leases = new RuntimeCapsuleLeaseRepository(this.prisma)
    const identity = { projectId: input.projectId, validationHash: input.validationHash, runId: input.runId }
    const lease = await leases.acquire(identity)
    let timer: ReturnType<typeof setInterval> | undefined
    const release = async () => {
      if (timer) clearInterval(timer)
      await leases.release({ ...identity, ownerToken: lease.ownerToken })
    }
    try {
      await leases.renew({ ...identity, ownerToken: lease.ownerToken })
      if (
        (await new RuntimeCapsuleRepository(this.prisma, this.appraiseRoot).inspect({
          ...identity,
          testRunId: input.testRunId,
        })) !== 'ready'
      )
        throw new Error('Capsule execution requires complete ready immutable storage.')
      await defaultCapsulePreflightDependencies.prepareOutput(input.capsuleRoot, receipt.outputs.report.path)
      await defaultCapsulePreflightDependencies.prepareOutput(input.capsuleRoot, receipt.outputs.log.path)
      await leases.renew({ ...identity, ownerToken: lease.ownerToken })
      const sealedEnvironment = resolveSealedEnvironment(receipt)
      if (globalThis.process.platform === 'win32')
        throw new Error('Capsule process-group execution requires a supported POSIX host.')
      const process = await spawnOwnedProcessGroup(receipt.command.executable, receipt.command.executionArgv, {
        supervisorPath: path.join(this.appraiseRoot, 'scripts/owned-process-supervisor.mjs'),
        requireRuntimeBrowserClose: true,
        cwd: input.capsuleRoot,
        env: sealedEnvironment,
        extendEnv: false,
        streamLogs: true,
        prefixLogs: true,
        logPrefix: `test-run-${input.runId}`,
        captureOutput: true,
        redactOutput: credentialRedactor([sealedEnvironment.APPRAISE_ENV_PASSWORD]),
      })
      this.ownedProcesses.set(process.name, process)
      processManager.register(input.runId, process)
      timer = setInterval(() => {
        void leases.renew({ ...identity, ownerToken: lease.ownerToken }).catch(() => {
          void stopOwnedProcessGroup(process).catch(error =>
            console.error('[CapsuleExecutorAdapter] Owned process stop failed after lease loss:', error),
          )
        })
      }, 10_000)
      timer.unref?.()
      let finalizing: Promise<void> | undefined
      const finishExit = () => {
        finalizing ??= ensureOwnedProcessGroupExited(process)
          .then(release)
          .catch(error => console.error('[CapsuleExecutorAdapter] Owned group exit unverified:', error))
      }
      process.process.once('exit', finishExit)
      if (!process.isRunning) finishExit()
      return { process, reportPath: path.join(input.capsuleRoot, receipt.outputs.report.path) }
    } catch (error) {
      await release()
      throw error
    }
  }

  waitForProcess(processName: string): Promise<number | null> {
    return this.waitForOwnedProcess(processName)
  }

  private async waitForOwnedProcess(processName: string): Promise<number | null> {
    const spawned = this.ownedProcesses.get(processName)
    if (!spawned) throw new Error('Capsule process-group ownership is unavailable for completion.')
    const exitCode = await waitForTask(processName)
    await ensureOwnedProcessGroupExited(spawned)
    return exitCode
  }

  releaseTerminalProcess(runId: string, processName: string): void {
    processManager.unregister(runId)
    this.ownedProcesses.delete(processName)
  }

  private assertReceipt(input: CapsuleExecutionRequest, receipt: CapsuleCommandReceiptV1) {
    if (
      hashCapsuleCommandReceipt(receipt) !== input.receiptHash ||
      receipt.ownership.targetProjectId !== input.projectId ||
      receipt.ownership.validationHash !== input.validationHash ||
      receipt.ownership.testRunId !== input.testRunId ||
      receipt.ownership.runId !== input.runId
    )
      throw new Error('Capsule execution receipt ownership or hash differs.')
  }
}
