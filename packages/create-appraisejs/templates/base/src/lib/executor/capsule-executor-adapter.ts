import type { PrismaClient } from '@prisma/client'
import { spawnTask, waitForTask, type SpawnedProcess } from '@/lib/process/task-spawner'
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

export type CapsuleExecutionRequest = {
  projectId: string
  validationHash: string
  testRunId: string
  runId: string
  capsuleRoot: string
  receiptHash: string
}

export class CapsuleExecutorAdapter {
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
      const process = await spawnTask(receipt.command.executable, receipt.command.executionArgv, {
        cwd: input.capsuleRoot,
        env: resolveSealedEnvironment(receipt),
        streamLogs: true,
        prefixLogs: true,
        logPrefix: `test-run-${input.runId}`,
        captureOutput: true,
      })
      processManager.register(input.runId, process)
      timer = setInterval(() => {
        void leases.renew({ ...identity, ownerToken: lease.ownerToken }).catch(() => process.process.kill('SIGTERM'))
      }, 10_000)
      timer.unref?.()
      process.process.once('exit', () => {
        processManager.unregister(input.runId)
        void release()
      })
      return { process, reportPath: path.join(input.capsuleRoot, receipt.outputs.report.path) }
    } catch (error) {
      await release()
      throw error
    }
  }

  waitForProcess(processName: string): Promise<number | null> {
    return waitForTask(processName)
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
