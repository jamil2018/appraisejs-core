import { EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  canonicalCapsuleCommandReceipt,
  hashCapsuleCommandReceipt,
} from '@/lib/runtime-capsule/command-receipt-contract'
import { sealCapsuleCommandReceipt } from '@/lib/runtime-capsule/command-receipt-sealer'
import { hashRuntimeCapsuleBytes } from '@/lib/runtime-capsule/contracts'

const hash = (character: string) => `sha256:${character.repeat(64)}`
const workspaces: string[] = []
const { spawnOptions } = vi.hoisted(() => ({ spawnOptions: [] as Array<Record<string, unknown>> }))

vi.mock('@/lib/process/task-spawner', () => ({
  spawnTask: vi.fn(async (_command: string, _argv: string[], options: Record<string, unknown>) => {
    spawnOptions.push(options)
    const child = new EventEmitter() as EventEmitter & { kill(): boolean }
    child.kill = () => true
    return {
      process: child,
      pid: 1,
      name: 'capsule-test',
      output: { stdout: [], stderr: [] },
      isRunning: true,
      exitCode: null,
      startTime: new Date(),
      endTime: null,
    }
  }),
}))

vi.mock('@/lib/test-run/process-manager', () => ({ processManager: { register: vi.fn(), unregister: vi.fn() } }))

vi.mock('@/lib/runtime-capsule', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/runtime-capsule')>()
  return {
    ...actual,
    RuntimeCapsuleLeaseRepository: class {
      async acquire() {
        return { ownerToken: 'lease-owner' }
      }
      async renew() {}
      async release() {}
    },
    RuntimeCapsuleRepository: class {
      async inspect() {
        return 'ready'
      }
    },
    defaultCapsulePreflightDependencies: { prepareOutput: vi.fn(async () => undefined) },
  }
})

import { CapsuleExecutorAdapter } from './capsule-executor-adapter'

afterEach(async () => {
  vi.unstubAllEnvs()
  spawnOptions.splice(0)
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

async function sealedCredentialReceipt() {
  const expectedCases = [{ validationId: 'validation', suiteId: 'suite', caseId: 'case', scenarioId: 'scenario' }]
  return sealCapsuleCommandReceipt({
    operation: {
      id: 'qvp_validation',
      operationHash: hash('a'),
      projectionHash: hash('b'),
      receiptHash: hash('c'),
      runtimeInputHash: hash('d'),
      targetProjectId: 'target',
      validationHash: hash('e'),
    },
    testRun: {
      id: 'test-run',
      runId: 'run',
      browserEngine: 'CHROMIUM',
      environment: {
        id: 'environment',
        name: 'Sauce Demo',
        baseUrl: 'https://example.test/',
        username: 'standard_user',
        credentialState: 'REFERENCE_CONFIGURED',
        passwordEnvironmentVariable: 'APPRAISE_TEST_PASSWORD',
      },
    },
    runtimeInput: { extensionPolicy: { declarationHash: hash('f'), compilerVersion: '1' } },
    built: {
      cases: expectedCases,
      files: [
        { path: 'cucumber.mjs', role: 'config', bytes: Buffer.from('export default {}\n') },
        { path: 'features/login.feature', role: 'feature', bytes: Buffer.from('Feature: Login\n') },
        { path: 'bindings/login.mjs', role: 'binding', bytes: Buffer.from('export const binding = true\n') },
        { path: 'support/world.mjs', role: 'support', bytes: Buffer.from('export const world = true\n') },
        { path: 'support/hooks.mjs', role: 'support', bytes: Buffer.from('export const hooks = true\n') },
        { path: 'expected-cases.json', role: 'expected-cases', bytes: Buffer.from(JSON.stringify(expectedCases)) },
      ],
    },
  })
}

describe('CapsuleExecutorAdapter credential handoff', () => {
  it('parses a real sealed environment reference and passes only the current credential to the spawned, redacted process', async () => {
    vi.stubEnv('APPRAISE_TEST_PASSWORD', 'rotated-runtime-secret')
    const receipt = await sealedCredentialReceipt()
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-capsule-executor-'))
    workspaces.push(workspace)
    await fs.writeFile(path.join(workspace, 'command-receipt.json'), canonicalCapsuleCommandReceipt(receipt))

    await new CapsuleExecutorAdapter({} as PrismaClient, workspace).execute({
      projectId: 'target',
      validationHash: hash('e'),
      testRunId: 'test-run',
      runId: 'run',
      capsuleRoot: workspace,
      receiptHash: hashCapsuleCommandReceipt(receipt),
    })

    const options = spawnOptions[0]!
    expect(options).toMatchObject({
      extendEnv: false,
      env: expect.objectContaining({
        APPRAISE_ENV_PASSWORD: 'rotated-runtime-secret',
        APPRAISE_ENV_USERNAME: 'standard_user',
      }),
    })
    expect((options.redactOutput as (value: string) => string)('credential=rotated-runtime-secret')).toBe(
      'credential=[REDACTED]',
    )
    expect(JSON.stringify(receipt)).not.toContain('rotated-runtime-secret')
    expect(JSON.stringify(receipt)).not.toContain(hashRuntimeCapsuleBytes(Buffer.from('rotated-runtime-secret')))
  })
})
