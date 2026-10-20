/** Compatibility boundary for the accepted peer/coordinator protocol. */
export function createMatrixJournalAdapter(durable) {
  if (!durable || typeof durable.snapshot !== 'function' || typeof durable.reserve !== 'function')
    throw new Error('durable phase journal required')
  const mapUnknown = reason => {
    if (durable.snapshot().fenced) return durable.snapshot()
    return durable.markUnknown(
      {
        'case-deadline': 'DEADLINE',
        'ambiguous-effect': 'AMBIGUOUS_EFFECT',
        'protocol-error': 'PROTOCOL',
      }[reason] ?? 'AMBIGUOUS_EFFECT',
    )
  }
  const witnesses = new Map()
  return Object.freeze({
    begin: id => durable.begin(id),
    reserve: (kind, id) => durable.reserve(kind, id),
    acknowledge: id => durable.acknowledge(id),
    bindCaseWitness: ({ caseId, sha256 }) => {
      if (durable.snapshot().current !== caseId || witnesses.has(caseId) || !/^[a-f0-9]{64}$/.test(sha256 ?? ''))
        throw new Error('one durable current-case witness required')
      witnesses.set(caseId, sha256)
    },
    finish: input => {
      const hash = witnesses.get(durable.snapshot().current)
      if (!hash) throw new Error('durable case witness absent')
      return durable.finish({ ...input, caseWitnessSha256: hash })
    },
    markUnknown: mapUnknown,
    recordRecovery: input => durable.recordRecovery(input),
    snapshot: () => {
      const snapshot = durable.snapshot()
      const counts = Object.fromEntries(
        Object.keys(snapshot.counts[snapshot.current] ?? {}).map(kind => [
          kind,
          snapshot.counts[snapshot.current][kind],
        ]),
      )
      return { ...snapshot, activeCase: snapshot.current, counts }
    },
  })
}
