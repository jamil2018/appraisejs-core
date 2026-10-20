// Sanitized in-memory evidence projection, not an authenticated receipt or retention service.
const classes = new Set([
  'unregistered',
  'invocation-rejected',
  'os-effect-denied',
  'effect-occurred',
  'unreached',
  'UNKNOWN',
])
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export function evidence({
  caseId,
  classification,
  counts,
  correlations = {},
  hashes = {},
  observation = 'OFFLINE_SYNTHETIC',
}) {
  if (!/^B(0[1-9]|1[0-4])$|^P00$/.test(caseId) || !classes.has(classification) || observation !== 'OFFLINE_SYNTHETIC')
    throw new Error('evidence binding')
  // Offline fixtures cannot produce OS-denial evidence, even if their callers name that class.
  if (classification === 'os-effect-denied' || classification === 'effect-occurred')
    throw new Error('offline evidence cannot attest effects')
  const counters = {}
  for (const [key, max] of Object.entries({ threadStarts: 15, turnStarts: 14, providerRequests: 55 })) {
    if (!Number.isSafeInteger(counts?.[key]) || counts[key] < 0 || counts[key] > max)
      throw new Error('evidence counter')
    counters[key] = counts[key]
  }
  const ids = {}
  for (const [key, value] of Object.entries(correlations)) {
    if (
      !['requestId', 'threadId', 'turnId', 'itemId'].includes(key) ||
      typeof value !== 'string' ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(value)
    )
      throw new Error('correlation allowlist')
    ids[key] = value
  }
  const digests = {}
  for (const [key, value] of Object.entries(hashes)) {
    if (!['policy', 'manifest', 'receipt', 'canaryBefore', 'canaryAfter'].includes(key) || !sha(value))
      throw new Error('digest allowlist')
    digests[key] = value
  }
  return {
    caseId,
    classification,
    counts: counters,
    correlations: ids,
    hashes: digests,
    observation,
    containmentQualified: false,
    M02Complete: false,
    hostIsolation: 'NOT_ATTESTED',
  }
}
