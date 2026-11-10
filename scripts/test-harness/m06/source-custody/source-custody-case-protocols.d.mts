import type { SourceCaseRuntime } from './source-custody-instrumentation'
export function startSourceSendReservation<P, C, T>(
  runtime: SourceCaseRuntime,
  permit: P,
  client: C,
  beginOriginal: (permit: P, client: C) => T,
): T
export function acceptSourceSendReservation<T>(
  runtime: SourceCaseRuntime,
  operation: T,
): asserts operation is NonNullable<T>
export function assertSourceFactoryRefusal(runtime: SourceCaseRuntime, createOriginal: () => unknown): void

export function completeSourceCaseResult<T extends object>(
  runtime: SourceCaseRuntime,
  selected: string,
  result: T,
  trace: { restore(): void; counts(): { entries: number; admissions: number; rowReads: number } },
): T & {
  methodEntries: { entries: number; admissions: number; rowReads: number }
  engineQueryEvents: 'UNAVAILABLE_UNCONFIGURED'
  schema: 'FULL_CANONICAL_93' | 'MINIMAL_COMPONENT_NO_CANONICAL_RELEASE'
}

export function assertSourceFinalizerHandoff(
  runtime: SourceCaseRuntime,
  after: { disposed: boolean; held: boolean },
): void
export function createSourceRefusalTransaction<
  P,
  Tx extends { $executeRawUnsafe(query: string, ...args: unknown[]): PromiseLike<number> },
>(
  runtime: SourceCaseRuntime,
  trace: { capture<T>(operation: () => T): T },
  fixture: { permit: P; source: { transport: { request(method: string, params: object): Promise<unknown> } } },
  operation: {
    assertTransactionSettings(tx: Tx): unknown
    capture<T>(operation: () => Promise<T>): { reply: Promise<T> }
  },
  overflow: boolean,
  consumePermit: (permit: P) => unknown,
): Readonly<{ callback(tx: Tx): Promise<unknown>; delayed: Promise<unknown> | undefined }>

export function completeSourceCaptureRefusal<S extends { snapshot(): { diagnostics: unknown }; dispose(): void }, D>(
  runtime: SourceCaseRuntime,
  fixture: { source: S; database: D },
  overflow: boolean,
  disposeDatabase: (database: D) => unknown,
  assertRetained: (source: S, database: D, before: ReturnType<S['snapshot']>['diagnostics']) => void,
): { retained: true; expected: string; source: ReturnType<S['snapshot']>; captureSqlEntries: 0 }
