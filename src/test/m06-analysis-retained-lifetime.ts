import assert from 'node:assert/strict'
import type {
  AnalysisFollowupController,
  AnalysisFollowupDelivery,
} from '@/services/coordinator/quality-journey-analysis-scheduler'

type Operation = {
  label: string
  state: 'PENDING' | 'FULFILLED' | 'REJECTED'
  original?: Promise<unknown>
  error?: unknown
}
type Client = { $disconnect: () => Promise<void> }
type DeliveryCell = { actual: AnalysisFollowupDelivery | undefined }

/** Preserve the exact authored subset assertions using ordinary Node assertions. */
export function assertRetainedFields(actual: unknown, expected: unknown): void {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    assert.deepEqual(actual, expected)
    return
  }
  assert.ok(actual && typeof actual === 'object')
  for (const [key, value] of Object.entries(expected))
    assertRetainedFields((actual as Record<string, unknown>)[key], value)
}

/** Validate one trusted retained snapshot; this grants no cleanup or termination authority. */
export function assertRetainedDeliveryCanClose(snapshot: ReturnType<AnalysisFollowupDelivery['snapshot']>): void {
  assert.notEqual(snapshot.originalStartState, 'PENDING', 'Original delivery start is still pending.')
  // Only explicit original disposition can exempt a retained adapter from owned drain.
  // This grants client closure only; its physical UNKNOWN and references remain retained.
  if (snapshot.childLaunchEntered === false) {
    if (snapshot.originalStartState === 'REJECTED' && snapshot.fenced === true) return
    if (
      snapshot.originalStartState === 'NOT_CALLED' &&
      snapshot.state === 'startup' &&
      snapshot.fenced === false &&
      !snapshot.providerRunId
    )
      return
  }
  const cleanup = snapshot.cleanup
  assert.equal(cleanup?.status, 'stopped', 'Actual owned drain is unverified.')
  assert.equal(cleanup!.groupExitObserved, true, 'Original owned group exit is unverified.')
}

/** Task-local owner of actual references. No clocks, cleanup, source authority or inferred terminal state. */
export class RetainedAnalysisLifetime {
  readonly operations: Operation[] = []
  readonly clients: Client[] = []
  readonly deliveryCells: DeliveryCell[] = []
  readonly deliveries: AnalysisFollowupDelivery[] = []
  admissionOpen = true
  failed = false

  retainClient(actual: Client) {
    this.clients.push(actual)
    return actual
  }

  reserveDelivery(): { cell: DeliveryCell; controller: AnalysisFollowupController } {
    assert.equal(this.admissionOpen, true)
    const cell: DeliveryCell = { actual: undefined }
    this.deliveryCells.push(cell)
    return {
      cell,
      controller: {
        retainDelivery: actual => {
          cell.actual = actual
          this.deliveries.push(actual)
        },
      },
    }
  }

  track<T>(label: string, invoke: () => Promise<T>): Promise<T> {
    assert.equal(this.admissionOpen, true, 'Retained owner admission is closed.')
    return this.retainOperation(label, invoke)
  }

  private retainOperation<T>(label: string, invoke: () => Promise<T>): Promise<T> {
    const record: Operation = { label, state: 'PENDING' }
    this.operations.push(record)
    try {
      const actual = invoke()
      record.original = actual
      void actual.then(
        () => {
          record.state = 'FULFILLED'
        },
        error => {
          record.state = 'REJECTED'
          record.error = error
        },
      )
      return actual
    } catch (error) {
      record.state = 'REJECTED'
      record.error = error
      throw error
    }
  }

  retainFailure() {
    this.failed = true
    this.admissionOpen = false
  }

  async closeKnownSettledClients() {
    assert.equal(this.failed, false, 'Failed or unclassified owner must remain retained.')
    assert.ok(
      this.operations.every(operation => operation.state !== 'PENDING'),
      'Original operations are still pending.',
    )
    for (const actual of this.deliveries) {
      assertRetainedDeliveryCanClose(actual.snapshot())
    }
    this.admissionOpen = false
    // Closure operations themselves remain retained if any original disconnect fails or stays pending.
    await Promise.all(
      this.clients.map((actual, index) => this.retainOperation(`client-close:${index}`, () => actual.$disconnect())),
    )
  }

  disposition() {
    return {
      failed: this.failed,
      admissionOpen: this.admissionOpen,
      clients: this.clients.length,
      operations: this.operations.map(({ label, state }) => ({ label, state })),
      deliveries: this.deliveries.map(actual => actual.snapshot()),
      runtimeQualified: false,
    }
  }
}
