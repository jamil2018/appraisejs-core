import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import {
  forwardSourceRaw,
  forwardSourceTransaction,
  createSourcePersistenceEvidence,
} from './source-custody-passive-forwarding.mjs'

export type OperationAdmission = { readonly id: number; readonly phase: string; readonly kind: 'actual' | 'auxiliary' }
export type PassiveObservation = {
  origin(): OperationAdmission | undefined
  capture(original: unknown, admission: OperationAdmission | undefined, site: string): void
  fail(error: unknown): void
  eligible(): boolean
}
export type SourceCaseRuntime = {
  readonly failed: boolean
  readonly phase: string
  readonly observation: PassiveObservation
  assertActive(): void
  begin(phase: string, kind?: 'actual' | 'auxiliary'): OperationAdmission
  // Admission is evaluated first, before the original expression. Returns original unchanged.
  keep<T>(admission: OperationAdmission, original: T): T
  retain(name: string, value: unknown): void
  event(kind: string, data?: Record<string, unknown>): void
}
export type SourceIpcFaultHooks = {
  raw(
    original: unknown,
    admission: OperationAdmission | undefined,
    receiver: object,
    site: string,
    failedAtEntry: boolean,
  ): void
  outer(original: unknown, admission: OperationAdmission | undefined): void
  callbackFulfilled(value: unknown, admission: OperationAdmission | undefined): void
  suppressed(value: unknown, admission: OperationAdmission | undefined): void
  controlled(actual: unknown, controlled: unknown, admission: OperationAdmission | undefined, tx: unknown): void
}

/** Global wrappers observe admitted work; they never throw fixture stops into that work. */
export function instrumentSourcePersistence(runtime: SourceCaseRuntime, faultHooks?: SourceIpcFaultHooks) {
  runtime.assertActive()
  const passive = runtime.observation
  const prototype = PrismaClient.prototype
  const methods = ['$queryRawUnsafe', '$executeRawUnsafe', '$transaction'] as const
  const originals = new Map(methods.map(name => [name, Object.getOwnPropertyDescriptor(prototype, name)!]))
  for (const descriptor of originals.values()) assert.equal(typeof descriptor.value, 'function')
  const transactions = new WeakMap<object, OperationAdmission | undefined>()
  const capture = { active: false }
  const evidence = createSourcePersistenceEvidence(runtime, transactions, capture)
  const { observe, entry } = evidence
  const forwarding = {
    runtime,
    passive,
    transactions,
    faultHooks,
    observe,
    entry,
    fault: undefined as string | undefined,
  }
  for (const name of ['$queryRawUnsafe', '$executeRawUnsafe'] as const) {
    const original = originals.get(name)!.value
    Object.defineProperty(prototype, name, {
      ...originals.get(name),
      value: function (...args: unknown[]) {
        return forwardSourceRaw(forwarding, original, this, name, args)
      },
    })
  }
  const originalTransaction = originals.get('$transaction')!.value
  Object.defineProperty(prototype, '$transaction', {
    ...originals.get('$transaction'),
    value: function (action: unknown, ...args: unknown[]) {
      return forwardSourceTransaction(forwarding, originalTransaction, this, action, args, () => evidence.admit(action))
    },
  })
  return {
    counts: evidence.counts,
    rejectNextOuter(phase: string) {
      runtime.assertActive()
      assert(!forwarding.fault)
      forwarding.fault = phase
    },
    genuineTx(tx: object) {
      runtime.assertActive()
      assert(transactions.has(tx), 'Expected actual callback tx receiver')
    },
    capture<T>(action: () => T): T {
      runtime.assertActive()
      assert(!capture.active)
      const { entries, admissions } = evidence.counts()
      const before = { entries, admissions }
      capture.active = true
      try {
        return action()
      } finally {
        capture.active = false
        runtime.assertActive()
        const after = evidence.counts()
        assert.deepEqual(
          { entries: after.entries, admissions: after.admissions },
          before,
          'Capture scheduled/admitted source persistence',
        )
      }
    },
    restore() {
      runtime.assertActive()
      for (const [name, descriptor] of originals) Object.defineProperty(prototype, name, descriptor)
    },
  }
}
