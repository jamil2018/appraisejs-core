import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  caseRecord: vi.fn(),
  runRecord: vi.fn(),
  reportRecord: vi.fn(),
}))

vi.mock('@/config/db-config', () => ({
  default: {
    testCase: { findFirst: db.caseRecord },
    testRun: { findFirst: db.runRecord },
    report: { findFirst: db.reportRecord },
  },
}))

import { loadJourneyRecordContext } from './quality-journey-record-context'

describe('Journey brief record context', () => {
  beforeEach(() => {
    Object.values(db).forEach(read => read.mockReset())
  })

  it('reads only the title of an unarchived test case within the active project', async () => {
    db.caseRecord.mockResolvedValue({ title: 'Guest checkout' })
    const reference = { kind: 'test-case', id: 'checkout-case' } as const
    expect(await loadJourneyRecordContext('project-a', reference)).toEqual({
      ...reference,
      source: 'appraise.record/v1',
      title: 'Guest checkout',
    })
    expect(db.caseRecord).toHaveBeenCalledWith({
      where: { id: 'checkout-case', targetProjectId: 'project-a', archivedAt: null },
      select: { title: true },
    })
  })

  it('does not expose a report unless it and its associated run resolve within the selected project', async () => {
    db.reportRecord.mockResolvedValue(null)
    expect(await loadJourneyRecordContext('project-b', { kind: 'report', id: 'checkout-report' })).toBeUndefined()
    expect(db.reportRecord).toHaveBeenCalledWith({
      where: { id: 'checkout-report', targetProjectId: 'project-b', testRun: { targetProjectId: 'project-b' } },
      select: { name: true },
    })
    expect(db.runRecord).not.toHaveBeenCalled()
    expect(db.caseRecord).not.toHaveBeenCalled()
  })
})
