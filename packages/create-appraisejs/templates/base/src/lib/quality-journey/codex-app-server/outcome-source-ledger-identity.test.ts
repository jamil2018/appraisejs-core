import assert from 'node:assert/strict'
import type { ProviderSourceTransaction } from '../provider-source-database'
import { describe, expect, it, vi } from 'vitest'
import { outcomeSourceBounds } from './outcome-source-contract'
import { readProviderSourceLedgerRecords, type SourceLedgerRecord } from './outcome-source-sqlite-journal'

// The actual reader is imported, while its sole database runtime dependency is
// replaced before evaluation. No Prisma client, engine, owner or controller loads.
const database = vi.hoisted(() => ({
  transaction: vi.fn(() => {
    throw new Error('Inert ledger reader must not open a database transaction.')
  }),
}))
vi.mock('../provider-source-database', () => ({ providerSourceTransaction: database.transaction }))

function ledgerFixture() {
  const receipt = { physical: { sourceId: 'sqlite_custodian_inert-original' } }
  const originalRows: SourceLedgerRecord[] = ['NOT_EMITTED', 'DISCARDED'].map((kind, index) => ({
    sequence: index + 1,
    previousHead: `sha256:${'a'.repeat(64)}`,
    head: `sha256:${'b'.repeat(64)}`,
    kind,
    dataJson: '{}',
    byteCount: 100,
  }))
  const bySourceId = new Map([[receipt.physical.sourceId, originalRows]])
  const query = vi.fn(async (sql: string, sourceId: string, limit: number) => {
    // Responses depend on the actual reader's selected ID and bounded query.
    assert.match(sql, /WHERE sourceId=\? ORDER BY sequence LIMIT \?/)
    const rows = (bySourceId.get(sourceId) ?? []).slice(0, limit)
    if (sql.startsWith('SELECT COUNT(*)')) {
      const actualBytes = rows.reduce(
        (total, row) =>
          total + Object.values(row).reduce<number>((bytes, value) => bytes + Buffer.byteLength(String(value)), 0),
        0,
      )
      return [{ recordCount: rows.length, actualBytes }]
    }
    assert.match(sql, /^SELECT sequence,previousHead,head,kind,dataJson,byteCount/)
    return rows
  })
  const tx = { $queryRawUnsafe: query } as unknown as ProviderSourceTransaction
  return { receipt, originalRows, tx, query }
}

describe('inert actual source ledger reader identity', () => {
  it('distinguishes the original receipt ID from the hardcoded and foreign IDs', async () => {
    const { receipt, originalRows, tx, query } = ledgerFixture()
    const hardcoded = await readProviderSourceLedgerRecords(tx, 'source')
    expect(hardcoded).toEqual([])
    // This is the existing sourceHappy presence predicate, which the wrong ID fails.
    expect(() => assert(hardcoded.some(row => row.kind === 'NOT_EMITTED'))).toThrow(assert.AssertionError)

    const original = await readProviderSourceLedgerRecords(tx, receipt.physical.sourceId)
    expect(original).toEqual(originalRows)
    assert(original.some(row => row.kind === 'NOT_EMITTED'))
    assert(original.some(row => row.kind === 'DISCARDED'))
    expect(Object.isFrozen(original)).toBe(true)
    expect(original.every(Object.isFrozen)).toBe(true)

    const foreign = await readProviderSourceLedgerRecords(tx, 'sqlite_custodian_inert-foreign')
    expect(foreign).toEqual([])
    expect(query).toHaveBeenCalledTimes(6)
    for (const [index, sourceId] of ['source', receipt.physical.sourceId, 'sqlite_custodian_inert-foreign'].entries()) {
      const preflight = query.mock.calls[index * 2]
      const fullRows = query.mock.calls[index * 2 + 1]
      expect(preflight[0]).toMatch(/^SELECT COUNT\(\*\)/)
      expect(fullRows[0]).toMatch(/^SELECT sequence,previousHead,head,kind,dataJson,byteCount/)
      expect(preflight.slice(1)).toEqual([sourceId, outcomeSourceBounds.journalRecords + 1])
      expect(fullRows.slice(1)).toEqual([sourceId, outcomeSourceBounds.journalRecords + 1])
    }
    expect(database.transaction).not.toHaveBeenCalled()
  })
})
