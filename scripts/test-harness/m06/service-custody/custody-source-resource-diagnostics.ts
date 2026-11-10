import assert from 'node:assert/strict'

/**
 * Required read-only source dependency, not implemented by this service lane.
 * Every value must originate in the original private resources; absence refuses the fixture.
 * These diagnostics grant no proof, lookup, admission or destructive capability.
 */
export type OriginalSourceResourceDiagnostics = Readonly<{
  custody: Readonly<{
    allocationEntries: number
    frameEntries: number
    discardedFrames: number
    attemptedBytes: number
    allocationClearCalls: number
    frameClearCalls: number
    mayHaveActivated: boolean
  }>
  source: Readonly<{
    keyByteLength: number
    keyNonzeroBytes: number
    keyZeroCalls: number
    receiptEncodedBytes: number
    receiptReleaseCalls: number
    issuedProofPresent: boolean
    issuedExclusionPresent: boolean
    liveProofContainsIssued: boolean
    issuedProofMatchesOriginal: boolean
    issuedExclusionMatchesOriginal: boolean
    liveProofMapReplaceCalls: number
    issuedClearCalls: number
    replayTombstoneContainsOriginal: boolean
    journalOpen: boolean
    journalDisposeCalls: number
  }>
}>

const custodyNumbers = [
  'allocationEntries',
  'frameEntries',
  'discardedFrames',
  'attemptedBytes',
  'allocationClearCalls',
  'frameClearCalls',
] as const
const custodyBooleans = ['mayHaveActivated'] as const
const sourceNumbers = [
  'keyByteLength',
  'keyNonzeroBytes',
  'keyZeroCalls',
  'receiptEncodedBytes',
  'receiptReleaseCalls',
  'liveProofMapReplaceCalls',
  'issuedClearCalls',
  'journalDisposeCalls',
] as const
const sourceBooleans = [
  'issuedProofPresent',
  'issuedExclusionPresent',
  'liveProofContainsIssued',
  'issuedProofMatchesOriginal',
  'issuedExclusionMatchesOriginal',
  'replayTombstoneContainsOriginal',
  'journalOpen',
] as const
function record(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object')
  return value as Record<string, unknown>
}
function checkedCounters(value: Record<string, unknown>, numbers: readonly string[]) {
  for (const key of numbers)
    assert.ok(
      typeof value[key] === 'number' && Number.isSafeInteger(value[key]) && Number(value[key]) >= 0,
      `Missing actual resource counter ${key}`,
    )
}
function checkedMemberships(value: Record<string, unknown>, booleans: readonly string[]) {
  for (const key of booleans) assert.equal(typeof value[key], 'boolean', `Missing actual resource membership ${key}`)
}
export function originalSourceResources(snapshot: unknown): OriginalSourceResourceDiagnostics {
  const whole = record(snapshot)
  const diagnostics = record(whole.diagnostics)
  const custody = record(diagnostics.custody)
  const source = record(diagnostics.source)
  checkedCounters(custody, custodyNumbers)
  checkedMemberships(custody, custodyBooleans)
  checkedCounters(source, sourceNumbers)
  checkedMemberships(source, sourceBooleans)
  const resources = record(whole.resources)
  assert.equal(custody.allocationEntries, whole.allocations)
  assert.equal(custody.discardedFrames, whole.discardedFrames)
  assert.equal(custody.attemptedBytes, whole.attemptedBytes)
  assert.equal(source.keyByteLength, resources.keyByteLength)
  assert.equal(source.keyNonzeroBytes, resources.keyNonzeroBytes)
  assert.equal(source.receiptEncodedBytes, resources.receiptBytes)
  assert.equal(source.journalOpen, resources.journalOpen)
  // Copy diagnostic primitives only; never retain a mutable snapshot object from an implementation.
  return Object.freeze({
    custody: Object.freeze(Object.fromEntries([...custodyNumbers, ...custodyBooleans].map(key => [key, custody[key]]))),
    source: Object.freeze(Object.fromEntries([...sourceNumbers, ...sourceBooleans].map(key => [key, source[key]]))),
  }) as OriginalSourceResourceDiagnostics
}

export function assertEligibleSourceDestruction(
  before: OriginalSourceResourceDiagnostics,
  after: OriginalSourceResourceDiagnostics,
) {
  assert.equal(after.source.keyByteLength, before.source.keyByteLength)
  assert.equal(after.source.keyNonzeroBytes, 0)
  assert.equal(after.source.receiptEncodedBytes, 0)
  for (const field of [
    'keyZeroCalls',
    'receiptReleaseCalls',
    'liveProofMapReplaceCalls',
    'issuedClearCalls',
    'journalDisposeCalls',
  ] as const)
    assert.equal(after.source[field], before.source[field] + 1, field)
  for (const field of [
    'issuedProofPresent',
    'issuedExclusionPresent',
    'liveProofContainsIssued',
    'issuedProofMatchesOriginal',
    'issuedExclusionMatchesOriginal',
    'journalOpen',
  ] as const)
    assert.equal(after.source[field], false, field)
  assert.equal(after.source.replayTombstoneContainsOriginal, true)
  for (const field of ['allocationEntries', 'frameEntries', 'discardedFrames', 'attemptedBytes'] as const)
    assert.equal(after.custody[field], 0, field)
  assert.equal(after.custody.allocationClearCalls, before.custody.allocationClearCalls + 1)
  assert.equal(after.custody.frameClearCalls, before.custody.frameClearCalls + 1)
  assert.equal(after.custody.mayHaveActivated, before.custody.mayHaveActivated)
  // Timeless sender-exclusion branding and the exact-replay tombstone are not destruction targets.
}
