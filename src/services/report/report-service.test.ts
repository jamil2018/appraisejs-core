import { describe, expect, it } from 'vitest'
import { RECENT_PERIOD_DAYS } from '@/services/shared/constants'

describe('report-service metrics filters (behavior)', () => {
  it('RECENT_PERIOD_DAYS matches dashboard/report window', () => {
    expect(RECENT_PERIOD_DAYS).toBe(7)
  })
})
