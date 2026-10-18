import { casePolicy, POLICY } from './policy.mjs'

/** Allowlisted offline projection, never a transcript or runtime/containment attestation. */
export function offlineEvidence(input) {
  const allowed = ['caseId', 'classification', 'counts', 'correlations', 'hashes']
  if (!input || Object.keys(input).some(key => !allowed.includes(key))) throw new Error('evidence field not allowed')
  casePolicy(input.caseId)
  if (
    !['accepted-fixture', 'schema-rejected', 'unregistered', 'binding-rejected', 'owner-rejected', 'UNKNOWN'].includes(
      input.classification,
    )
  )
    throw new Error('offline evidence class')
  const counts = {}
  for (const [key, value] of Object.entries(input.counts ?? {})) {
    if (
      !Object.hasOwn(POLICY.aggregate, key) ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > POLICY.aggregate[key]
    )
      throw new Error('evidence counter')
    counts[key] = value
  }
  const correlations = {}
  for (const [key, value] of Object.entries(input.correlations ?? {})) {
    if (
      !['requestId', 'threadId', 'turnId', 'innerCallId', 'outerCallId', 'acceptanceId'].includes(key) ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(value)
    )
      throw new Error('correlation not allowed')
    correlations[key] = value
  }
  const hashes = {}
  for (const [key, value] of Object.entries(input.hashes ?? {})) {
    if (
      !['policy', 'manifest', 'descriptor', 'route', 'schema', 'receipt', 'before', 'after'].includes(key) ||
      !/^[a-f0-9]{64}$/.test(value)
    )
      throw new Error('hash not allowed')
    hashes[key] = value
  }
  return {
    caseId: input.caseId,
    classification: input.classification,
    counts,
    correlations,
    hashes,
    observation: 'OFFLINE_SYNTHETIC',
    hostIsolation: 'NOT_ATTESTED',
    runtimeQualified: false,
    M02Complete: false,
  }
}

export function providerDisposition({ provider, authState }) {
  if (provider === 'SCRIPTED_LOCAL' && authState === 'NOT_REFERENCED')
    return { status: 'OFFLINE_FIXTURE_READY', realProviderAllowed: false }
  if (!['MISSING', 'UNKNOWN', 'CACHED'].includes(authState)) throw new Error('auth category only')
  return {
    status: authState === 'CACHED' ? 'BLOCKED_REAL_PROVIDER_NOT_AUTHORIZED' : 'AUTHENTICATION_REQUIRED',
    parked: true,
    realProviderAllowed: false,
    refreshAllowed: false,
    fallbackAllowed: false,
  }
}
