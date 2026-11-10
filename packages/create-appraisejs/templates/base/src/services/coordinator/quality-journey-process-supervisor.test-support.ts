import type { PrismaClient } from '@prisma/client'
import { vi } from 'vitest'
import type {
  createQualityJourneyProcessSupervisor,
  trustedJourneyProcessAdapter,
} from './quality-journey-process-supervisor'
import type { PrepareQualityJourneyProviderRunInput } from './quality-journey-provider-run-service'

const provider = vi.hoisted(() => ({
  prepare: vi.fn(),
  claim: vi.fn(),
  arm: vi.fn(),
  write: vi.fn(),
  ack: vi.fn(),
}))
export { provider }

vi.mock('@/lib/quality-journey/codex-app-server/owned-child', () => ({
  launchOwnedFixtureChild: () => {
    throw new Error('Real child launch is forbidden in inert tests.')
  },
}))
vi.mock('@/config/db-config', () => ({ default: {} }))
vi.mock('./quality-journey-provider-run-service', () => ({
  prepareQualityJourneyProviderRun: provider.prepare,
  claimQualityJourneyProviderIntent: provider.claim,
  armQualityJourneyProviderIntent: provider.arm,
  writeQualityJourneyProviderTransport: provider.write,
  recordQualityJourneyProviderAcknowledgement: provider.ack,
}))

export function supervisorGate<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
export function inertSupervisorFixture(
  factory: typeof createQualityJourneyProcessSupervisor,
  capability: typeof trustedJourneyProcessAdapter,
) {
  const child = {
    stop: vi.fn().mockResolvedValue({ status: 'stopped', groupExitObserved: true }),
    transport: {
      request: vi.fn(async (method: string) =>
        method === 'initialize'
          ? { isolationChecked: true }
          : method === 'thread/start'
            ? { thread: { id: 'thread' } }
            : { turn: { id: 'turn' } },
      ),
      notifyInitialized: vi.fn().mockResolvedValue(undefined),
      fence: vi.fn(),
      snapshot: () => ({ issuedRequests: 4 }),
    },
  }
  const launch = vi.fn().mockResolvedValue(child)
  const create = vi.fn().mockResolvedValue({})
  const supervisor = factory(
    {
      journeyId: 'journey',
      targetProjectId: 'project',
      attemptId: 'attempt',
      assignmentId: 'assignment',
      assignmentGeneration: 1,
      providerNamespace: 'synthetic:inert',
    } as PrepareQualityJourneyProviderRunInput,
    {
      capability,
      configurationDigest: `sha256:${'a'.repeat(64)}`,
      input: [],
      launch,
      validateReadiness: () => true,
    },
    { qualityJourneyProviderObservation: { create } } as unknown as PrismaClient,
  )
  return { supervisor, child, launch, create }
}
export function configureInertSupervisor() {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-22T00:00:00.000Z'))
  provider.prepare.mockResolvedValue({ intent: { id: 'intent' } })
  provider.claim.mockResolvedValue({ intent: { claimEpoch: 1 } })
  provider.arm.mockResolvedValue({
    run: { id: 'run', threadId: null },
    intent: {
      id: 'intent',
      sendBoundaryId: 'boundary',
      claimEpoch: 1,
      turnDueAt: new Date(Date.now() + 900_000),
      acknowledgementDueAt: new Date(Date.now() + 60_000),
    },
    permit: {},
    replayed: false,
  })
  provider.write.mockImplementation(async (_binding, send) => ({ reply: await send() }))
}
