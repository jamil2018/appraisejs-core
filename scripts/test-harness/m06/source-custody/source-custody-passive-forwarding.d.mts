import type {
  SourceCaseRuntime,
  PassiveObservation,
  OperationAdmission,
  SourceIpcFaultHooks,
} from './source-custody-instrumentation'
type Original = (...args: unknown[]) => unknown
export type SourceForwardingContext = {
  runtime: SourceCaseRuntime
  passive: PassiveObservation
  transactions: WeakMap<object, OperationAdmission | undefined>
  faultHooks: SourceIpcFaultHooks | undefined
  observe(action: () => void): void
  entry(receiver: object, method: string, args: unknown[]): void
  fault: string | undefined
}
export function forwardSourceRaw(
  context: SourceForwardingContext,
  original: Original,
  receiver: object,
  name: string,
  args: unknown[],
): unknown
export function forwardSourceTransaction(
  context: SourceForwardingContext,
  originalTransaction: Original,
  receiver: object,
  action: unknown,
  args: unknown[],
  admit: () => void,
): unknown
export type SourceFinalizerSnapshot = {
  disposed: boolean
  held: boolean
  resources: { keyNonzeroBytes: number }
  diagnostics: { custody: { allocationEntries: number } }
}
export function forwardSourceClientFinalizer<T extends SourceFinalizerSnapshot>(
  runtime: SourceCaseRuntime,
  original: Original,
  receiver: unknown,
  args: unknown[],
  target: { fixture?: { client: unknown; source: { snapshot(): T } } },
  state: { calls: number; atThrow: T | undefined },
  asynchronous: boolean,
  controlledError: unknown,
): unknown
export type SourceCleanupStopRow = { actual: unknown; actualFulfilled: boolean; controlled: unknown; label: string }
export type SourceCleanupForwardingContext = {
  control: { observation: PassiveObservation }
  runtime: SourceCaseRuntime
  observe(action: () => void): void
  rawEngine(client: object): { raw: object; engine: object }
  enginePrototype: object
  seen: Map<object, { client: object; raw: object }>
  stopRows: Map<object, SourceCleanupStopRow>
  clientRows: Map<object, unknown>
  event(kind: string, data?: Record<string, unknown>): void
  retained: { actualClients: unknown[]; actualStops: unknown[]; controlledAcks: unknown[] }
  ack: { promise: Promise<unknown> }
  reached: { resolve(): void }
  failure(error: unknown): void
  latch(error: unknown): void
  selectedLabel: string
  originalQuery: Original
  originalStop: Original
  originalClientDisconnect: Original
  readonly collection: boolean
  readonly allowlist: Set<object> | undefined
  readonly selectedEngine: object | undefined
}
export function createSourceCleanupForwarders(context: SourceCleanupForwardingContext): {
  queryEntry(this: object, ...args: unknown[]): unknown
  clientDisconnectEntry(this: object, ...args: unknown[]): unknown
  controlledStop(this: object, ...args: unknown[]): unknown
}
export function createSourcePersistenceEvidence(
  runtime: SourceCaseRuntime,
  transactions: WeakMap<object, OperationAdmission | undefined>,
  capture: { active: boolean },
): {
  observe(action: () => void): void
  entry(receiver: object, method: string, args: unknown[]): void
  admit(action: unknown): void
  counts(): { entries: number; admissions: number; rowReads: number }
}
