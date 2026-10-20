/** Fixed process-state counts from existing scoped metadata calls only; never an acceptance predicate. */
import { GIT_FILE_PIN } from './git-readiness.mjs'

const states = Object.freeze(['RUNNABLE', 'SLEEPING', 'STOPPED', 'ZOMBIE', 'OTHER'])
const identity = value =>
  Number.isSafeInteger(value?.pid) &&
  value.pid > 0 &&
  Number.isSafeInteger(value.birthSec) &&
  value.birthSec > 0 &&
  Number.isSafeInteger(value.birthUsec) &&
  value.birthUsec >= 0 &&
  value.birthUsec < 1000000
const key = value => `${value.pid}:${value.birthSec}:${value.birthUsec}`

export function createProcessStateDiagnostics(os) {
  const records = new Map()
  let overflow = false
  let unavailable = false
  const record = (entry, value) => {
    if (entry.observations >= 104) {
      overflow = true
      return
    }
    const state = states.includes(value.processState) ? value.processState : 'OTHER'
    if (!states.includes(value.processState)) unavailable = true
    entry.counts[state]++
    entry.observations++
  }
  return Object.freeze({
    ports: Object.freeze({
      listDirectChildren: parent => os.listDirectChildren(parent),
      directChildMetadata(parent, pid) {
        const value = os.directChildMetadata(parent, pid)
        if (identity(value) && value.pid === pid && value.ppid === parent && value.path === GIT_FILE_PIN.path) {
          const id = key(value)
          if (!records.has(id)) {
            if (records.size >= 4) overflow = true
            else
              records.set(id, {
                original: { pid, birthSec: value.birthSec, birthUsec: value.birthUsec },
                observations: 0,
                counts: Object.fromEntries(states.map(state => [state, 0])),
                goneObserved: false,
              })
          }
          const entry = records.get(id)
          if (entry) record(entry, value)
        }
        return value
      },
      identity(pid) {
        const value = os.identity(pid)
        for (const entry of records.values())
          if (entry.original.pid === pid) {
            if (value === null || (identity(value) && value.pid === pid && key(value) !== key(entry.original)))
              entry.goneObserved = true
            else if (identity(value) && value.pid === pid && key(value) === key(entry.original)) record(entry, value)
            else unavailable = true
          }
        return value
      },
    }),
    snapshot: () =>
      validateProcessStateDiagnostic({
        identities: [...records.values()].map((entry, index) => ({
          ordinal: index + 1,
          counts: { ...entry.counts },
          goneObserved: entry.goneObserved,
        })),
        overflow,
        unavailable,
        additionalOsQueries: 0,
        rawArgumentsOrEnvironmentRead: false,
      }),
  })
}

export function validateProcessStateDiagnostic(value) {
  const refuse = () => {
    throw new Error('R51 process-state diagnostic contract')
  }
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      'additionalOsQueries,identities,overflow,rawArgumentsOrEnvironmentRead,unavailable' ||
    value.additionalOsQueries !== 0 ||
    value.rawArgumentsOrEnvironmentRead !== false ||
    typeof value.overflow !== 'boolean' ||
    typeof value.unavailable !== 'boolean' ||
    !Array.isArray(value.identities) ||
    value.identities.length > 4
  )
    refuse()
  const identities = value.identities.map((row, index) => {
    if (
      !row ||
      Object.keys(row).sort().join(',') !== 'counts,goneObserved,ordinal' ||
      row.ordinal !== index + 1 ||
      typeof row.goneObserved !== 'boolean' ||
      !row.counts ||
      Object.keys(row.counts).sort().join(',') !== [...states].sort().join(',')
    )
      refuse()
    const counts = Object.fromEntries(
      states.map(state => {
        const count = row.counts[state]
        if (!Number.isSafeInteger(count) || count < 0 || count > 104) refuse()
        return [state, count]
      }),
    )
    if (Object.values(counts).reduce((a, b) => a + b, 0) > 104) refuse()
    return Object.freeze({ ordinal: row.ordinal, counts: Object.freeze(counts), goneObserved: row.goneObserved })
  })
  return Object.freeze({
    identities: Object.freeze(identities),
    overflow: value.overflow,
    unavailable: value.unavailable,
    additionalOsQueries: 0,
    rawArgumentsOrEnvironmentRead: false,
  })
}
