import { describe, expect, it } from 'vitest'

import type { CollaborationRecord } from './contracts'
import { prepareThreeWayCollaboration, resolvePreparedCollaboration } from './reconciliation'

function record(name: string, archived = false): CollaborationRecord {
  return {
    format: 'appraise.repository-collaboration/v1',
    portableProjectId: 'portable-project',
    portableId: 'module-one',
    version: 1,
    archived,
    kind: 'module',
    payload: { name, parentPortableId: null },
  }
}

describe('three-way collaboration review', () => {
  it.each([
    { local: record('base'), incoming: record('incoming'), baseline: record('base'), disposition: 'USE_INCOMING' },
    { local: record('local'), incoming: record('base'), baseline: record('base'), disposition: 'KEEP_LOCAL' },
    { local: record('same'), incoming: record('same'), baseline: record('base'), disposition: 'REBASE' },
    { local: record('local'), incoming: record('incoming'), baseline: record('base'), disposition: 'CONFLICT' },
  ] as const)('classifies $disposition without field merging', ({ local, incoming, baseline, disposition }) => {
    const [prepared] = prepareThreeWayCollaboration({
      incoming: [incoming],
      localByKey: new Map([['module:module-one', local]]),
      baselineByKey: new Map([['module:module-one', baseline]]),
    })
    expect(prepared.disposition).toBe(disposition)
  })

  it('requires adoption review even when an unmapped same-identity record is equal', () => {
    const same = record('same')
    const [prepared] = prepareThreeWayCollaboration({
      incoming: [same],
      localByKey: new Map([['module:module-one', same]]),
      baselineByKey: new Map(),
    })
    expect(prepared).toMatchObject({ disposition: 'ADOPT_REVIEW', requiresDecision: true })
  })

  it('accepts only whole-record edited resolutions with the same identity', () => {
    const local = record('local')
    const incoming = record('incoming')
    const prepared = prepareThreeWayCollaboration({
      incoming: [incoming],
      localByKey: new Map([['module:module-one', local]]),
      baselineByKey: new Map([['module:module-one', record('base')]]),
    })
    expect(() => resolvePreparedCollaboration(prepared, new Map())).toThrow(/Missing decision/)
    expect(
      resolvePreparedCollaboration(
        prepared,
        new Map([['module:module-one', { decision: 'EDIT', editedRecord: record('resolved') }]]),
      )[0],
    ).toEqual(record('resolved'))
  })
})
