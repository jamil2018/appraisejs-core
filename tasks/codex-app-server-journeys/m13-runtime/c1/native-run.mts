import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import type { Writable } from 'node:stream'
import { z } from 'zod'
import {
  readNativePublicBytes,
  type NativeCredentialDescriptor,
} from '../../../../src/lib/quality-journey/codex-app-server/native-credential-topology'
import { nativeQualificationDigest } from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-contract'
import { createNativeQualificationParent, type NativeCasePreparation } from './native-driver.mts'
import { scriptedDisposableHuman } from './native-lineage.mts'
import { createAnonymousQualificationTarget } from './native-target.mts'
import { recoveryPauseSchema } from './recovery-case.mts'

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const absolute = z.string().refine(path.isAbsolute)
const control = z.object({ decisionPath: absolute, decisionDigest: digest, actualReviewPath: absolute }).strict()
const packet = z.record(z.string(), z.unknown())
const empty = <T extends string>(op: T) => z.object({ op: z.literal(op) }).strict()
const schema = z.discriminatedUnion('op', [
  empty('snapshot'),
  empty('freeze-candidate'),
  empty('b3-subject'),
  empty('next-role-subject'),
  empty('poll-execution'),
  empty('prepare-triage'),
  empty('archive'),
  empty('retain-unknown'),
  empty('target-subject'),
  empty('poll-recovery-boundary'),
  empty('seal-recovery-reader'),
  empty('read-recovery-snapshot'),
  empty('retain-recovery-case'),
  z.object({ op: z.literal('start-recovery-case'), control }).strict(),
  z.object({ op: z.literal('pause-recovery-case'), input: recoveryPauseSchema }).strict(),
  z.object({ op: z.literal('start-target'), control }).strict(),
  z.object({ op: z.literal('start-case'), control }).strict(),
  z.object({ op: z.literal('review-outcome'), control }).strict(),
  z.object({ op: z.literal('reconcile'), observationKey: z.string().min(1).max(160) }).strict(),
  z.object({ op: z.literal('prepare-followup'), packet }).strict(),
  z.object({ op: z.literal('prepare-discovery'), control }).strict(),
  z.object({ op: z.literal('start-discovery'), control, packet }).strict(),
  z.object({ op: z.literal('prepare-next-role'), control, packet }).strict(),
  z
    .object({
      op: z.literal('prepare-execution'),
      control,
      limits: z
        .object({
          caseMs: z.number().int().positive().max(300_000),
          cleanupMs: z.number().int().positive().max(300_000),
        })
        .strict(),
    })
    .strict(),
  z.object({ op: z.literal('start-execution'), control }).strict(),
  z.object({ op: z.literal('prepare-triager'), control, packet }).strict(),
  z
    .object({
      op: z.literal('prepare-closure'),
      choice: z
        .object({
          decision: z.enum(['CLOSED', 'RISK_ACCEPTED']),
          rationale: z.string().min(1).max(10_000).optional(),
          acceptedItemIds: z.array(z.string().min(1).max(200)).max(100),
        })
        .strict(),
    })
    .strict(),
  z.object({ op: z.literal('close-report'), control }).strict(),
])
export function parseNativeRunCommand(line: string) {
  if (Buffer.byteLength(line) > 1_048_576) throw new Error('Bounded native command refused')
  return schema.parse(JSON.parse(line))
}
/** Bounds both incomplete input and outstanding command closures before either can grow further. */
export function createNativeRunInputBudget() {
  let buffered = Buffer.alloc(0),
    pending = 0
  return Object.freeze({
    append(chunk: Buffer) {
      if (buffered.length + chunk.length > 1_048_576) throw new Error('Native input buffer limit')
      buffered = Buffer.concat([buffered, chunk])
      const lines: string[] = []
      let end: number
      while ((end = buffered.indexOf(10)) >= 0) {
        const line = buffered.subarray(0, end).toString('utf8')
        buffered = buffered.subarray(end + 1)
        if (line.trim()) lines.push(line)
        if (lines.length > 8) throw new Error('Native command batch limit')
      }
      return lines
    },
    reserve() {
      if (pending >= 8) throw new Error('Native pending command limit')
      pending++
    },
    settled() {
      if (pending > 0) pending--
    },
  })
}
/** The serialized command owner awaits this original write; blocked output cannot grow an unbounded queue. */
export function createNativeRunEmitter(original: Writable, deadlineMs = 5000) {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 5000)
    throw new Error('Bounded original output deadline required')
  original.on('error', () => {}) // The original write callback carries failure to its awaiting owner.
  return async (op: string, result: unknown) => {
    const bytes = Buffer.from(JSON.stringify({ op, result }) + '\n')
    if (bytes.length > 8 * 1024 * 1024) throw new Error('Bounded public output refused')
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        original.destroy()
        reject(new Error('Original public output deadline exceeded'))
      }, deadlineMs)
      try {
        original.write(bytes, error => {
          clearTimeout(timer)
          if (error) reject(new Error('Original public output failed'))
          else resolve()
        })
      } catch {
        clearTimeout(timer)
        reject(new Error('Original public output failed'))
      }
    })
  }
}
/** The credential descriptor arrives as metadata, before any selected file is read. */
export function readNativeRunPublic(filename: string, expectedDigest: string, source: NativeCredentialDescriptor) {
  if (!path.isAbsolute(filename) || !digest.safeParse(expectedDigest).success) throw new Error('Public input refused')
  const bytes = readNativePublicBytes(filename, source, 1_048_576)
  if (nativeQualificationDigest(bytes) !== expectedDigest) throw new Error('Public input drift')
  return JSON.parse(bytes.toString('utf8')) as unknown
}

/** Explicit task entry only. Import has no native, credential, listener, browser or database effect. */
export async function runNativeQualificationParent(args: string[]) {
  if (args.length !== 4 || args[0] !== '--prepare-only') throw new Error('Explicit prepare-only arguments required')
  const source = JSON.parse(args[3]) as NativeCredentialDescriptor
  const bootstrap = z
    .object({
      options: z
        .object({
          repositoryRoot: absolute,
          evidenceRoot: absolute,
          baseUrl: z
            .string()
            .url()
            .refine(value => {
              const url = new URL(value)
              return (
                url.protocol === 'http:' &&
                url.hostname === '127.0.0.1' &&
                !!url.port &&
                !url.username &&
                !url.password &&
                !url.search &&
                !url.hash &&
                url.pathname === '/checkout'
              )
            }),
        })
        .strict(),
      packet,
      target: z
        .object({
          requestLimit: z.number().int().positive().max(128),
          lifetimeMs: z.number().int().positive().max(3_600_000),
        })
        .strict(),
    })
    .strict()
    .parse(readNativeRunPublic(args[1], args[2], source))
  function exactPacket(value: Record<string, unknown>) {
    if (!isDeepStrictEqual(value.credentialSource, source)) throw new Error('Frozen credential metadata required')
    return value as NativeCasePreparation
  }
  const parent = createNativeQualificationParent(bootstrap.options)
  const emit = createNativeRunEmitter(process.stdout)
  const input = process.stdin,
    budget = createNativeRunInputBudget()
  let stopped = false
  let failureReported = false
  let retention: Promise<unknown> | undefined
  const target = createAnonymousQualificationTarget({
    ...bootstrap.target,
    baseUrl: bootstrap.options.baseUrl,
    source,
    onExpired() {
      void retain().catch(failed)
    },
  })
  function retain() {
    stopped = true
    retention ??= Promise.allSettled([parent.retainUnknown(), target.closeOriginal()]).then(outcomes => ({
      phase: 'UNKNOWN',
      nextCasePermitted: false,
      originalCleanup: outcomes.map(outcome => outcome.status),
    }))
    return retention
  }
  function caseCommand(command: ReturnType<typeof parseNativeRunCommand>) {
    switch (command.op) {
      case 'snapshot':
        return { handled: true as const, result: parent.snapshot() }
      case 'target-subject':
        return { handled: true as const, result: target.publicPrepared() }
      case 'start-target':
        return { handled: true as const, result: target.startVerified(command.control) }
      case 'start-case':
        return { handled: true as const, result: parent.startVerifiedCase(command.control) }
      case 'freeze-candidate':
        return { handled: true as const, result: parent.freezeCandidate() }
      case 'review-outcome':
        return { handled: true as const, result: parent.acceptIndependentReview(command.control) }
      case 'reconcile':
        return { handled: true as const, result: parent.reconcile(command.observationKey) }
      default:
        return recoveryCommand(command)
    }
  }
  function recoveryCommand(command: ReturnType<typeof parseNativeRunCommand>) {
    switch (command.op) {
      case 'start-recovery-case':
        return { handled: true as const, result: parent.startRecoveryCase(command.control) }
      case 'poll-recovery-boundary':
        return { handled: true as const, result: parent.pollRecoveryBoundary() }
      case 'pause-recovery-case':
        return { handled: true as const, result: parent.pauseRecoveryCase(command.input) }
      case 'retain-recovery-case':
        return { handled: true as const, result: parent.retainRecoveryCase() }
      case 'seal-recovery-reader':
        return { handled: true as const, result: parent.sealRecoveryReader() }
      case 'read-recovery-snapshot':
        return { handled: true as const, result: parent.readSealedRecoverySnapshot() }
      default:
        return { handled: false as const }
    }
  }
  function lineageCommand(command: ReturnType<typeof parseNativeRunCommand>) {
    switch (command.op) {
      case 'prepare-followup':
        return {
          handled: true as const,
          result: parent.prepareAnalysisFollowup(exactPacket(command.packet), scriptedDisposableHuman),
        }
      case 'b3-subject':
        return { handled: true as const, result: parent.b3AcceptanceSubject() }
      case 'prepare-discovery':
        return { handled: true as const, result: parent.prepareDiscoveryBoundary(command.control) }
      case 'start-discovery':
        return {
          handled: true as const,
          result: parent.startVerifiedDiscoveryBrowser(command.control, exactPacket(command.packet)),
        }
      case 'next-role-subject':
        return { handled: true as const, result: parent.nextRoleSubject() }
      case 'prepare-next-role':
        return { handled: true as const, result: parent.prepareNextRole(command.control, exactPacket(command.packet)) }
      default:
        return { handled: false as const }
    }
  }
  function executionCommand(command: ReturnType<typeof parseNativeRunCommand>) {
    switch (command.op) {
      case 'prepare-execution':
        return { handled: true as const, result: parent.prepareRealExecutionBoundary(command.control, command.limits) }
      case 'start-execution':
        return {
          handled: true as const,
          result: parent.startVerifiedExecution(command.control, scriptedDisposableHuman),
        }
      case 'poll-execution':
        return { handled: true as const, result: parent.pollOriginalExecution() }
      case 'prepare-triage':
        return { handled: true as const, result: parent.prepareTriageBoundary() }
      case 'prepare-triager':
        return {
          handled: true as const,
          result: parent.prepareTriagerCase(command.control, exactPacket(command.packet)),
        }
      case 'prepare-closure':
        return { handled: true as const, result: parent.prepareReportClosure(command.choice) }
      case 'close-report':
        return { handled: true as const, result: parent.closeVerifiedReport(command.control, scriptedDisposableHuman) }
      default:
        return { handled: false as const }
    }
  }
  async function dispatch(command: ReturnType<typeof parseNativeRunCommand>) {
    if (stopped) throw new Error('Original parent fenced')
    const native = caseCommand(command)
    if (native.handled) return native.result
    const lineageResult = lineageCommand(command)
    if (lineageResult.handled) return lineageResult.result
    const executionResult = executionCommand(command)
    if (executionResult.handled) return executionResult.result
    switch (command.op) {
      case 'archive': {
        const result = await parent.archiveReconciledEvidence()
        await target.closeOriginal()
        stopped = true
        input.pause()
        return result
      }
      case 'retain-unknown':
        return retain()
      default:
        throw new Error('Unknown explicit native command')
    }
  }
  function failed() {
    // Raw errors may contain runtime or private authority material. Never print them.
    if (!failureReported)
      process.stderr.write('M13 original parent stopped UNKNOWN; no replacement or retry admitted.\n')
    failureReported = true
    process.exitCode = 2
    input.pause()
    void retain().catch(() => {
      process.exitCode = 2
    })
  }
  let queue = Promise.resolve()
    .then(async () => {
      if (stopped) throw new Error('Original parent fenced')
      await emit('prepared', await parent.prepareInitialCase(exactPacket(bootstrap.packet)))
    })
    .catch(failed)
  input.on('data', (chunk: Buffer) => {
    if (stopped) return
    try {
      for (const line of budget.append(chunk)) {
        const command = parseNativeRunCommand(line)
        if (command.op === 'retain-unknown') {
          input.pause()
          void retain()
            .then(result => emit(command.op, result))
            .catch(failed)
          return
        }
        budget.reserve()
        queue = queue
          .then(async () => {
            await emit(command.op, await dispatch(command))
          })
          .catch(failed)
          .finally(budget.settled)
      }
    } catch {
      failed()
    }
  })
  input.on('end', () => {
    if (!stopped) void retain().catch(failed)
  })
  input.on('error', failed)
  process.stdout.on('error', failed)
  process.stderr.on('error', () => {})
  process.once('SIGINT', () => {
    input.pause()
    void retain().catch(failed)
  })
  process.once('SIGTERM', () => {
    input.pause()
    void retain().catch(failed)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void runNativeQualificationParent(process.argv.slice(2)).catch(() => {
    process.stderr.write('M13 explicit parent preparation refused.\n')
    process.exitCode = 2
  })
}
