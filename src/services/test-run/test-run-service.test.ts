import { describe, expect, it } from 'vitest'
import {
  buildOrExpression,
  buildTestRunsWhereClause,
  isCancelledOrCancellingStatus,
  normalizeSuiteSelection,
} from './test-run-helpers'
import { testRunSchema } from '@/constants/form-opts/test-run-form-opts'
import { TestRunResult, TestRunStatus } from '@prisma/client'
import { RECENT_PERIOD_DAYS } from '@/services/shared/constants'

describe('buildOrExpression', () => {
  it('returns null for empty input', () => {
    expect(buildOrExpression([])).toBeNull()
  })

  it('returns single expression unchanged', () => {
    expect(buildOrExpression(['@a'])).toBe('@a')
  })

  it('joins multiple with " or "', () => {
    expect(buildOrExpression(['@a', '@b'])).toBe('@a or @b')
  })
})

describe('normalizeSuiteSelection', () => {
  const base = { testSuiteId: 's1', runAll: false, testCaseIds: ['c1', 'c2'] as string[] }

  it('keeps runAll with empty ids', () => {
    const sel = { ...base, runAll: true, testCaseIds: [] }
    const out = normalizeSuiteSelection(sel, ['c1', 'c2'])
    expect(out.runAll).toBe(true)
    expect(out.testCaseIds).toEqual([])
  })

  it('treats full selection as runAll', () => {
    const sel = { ...base, runAll: false, testCaseIds: ['c1', 'c2'] }
    const out = normalizeSuiteSelection(sel, ['c1', 'c2'])
    expect(out.runAll).toBe(true)
    expect(out.testCaseIds).toEqual([])
  })

  it('keeps partial selection', () => {
    const sel = { ...base, runAll: false, testCaseIds: ['c1'] }
    const out = normalizeSuiteSelection(sel, ['c1', 'c2'])
    expect(out.runAll).toBe(false)
    expect(out.testCaseIds).toEqual(['c1'])
  })
})

describe('isCancelledOrCancellingStatus', () => {
  it('returns true for cancelled or cancelling', () => {
    expect(isCancelledOrCancellingStatus(TestRunStatus.CANCELLED)).toBe(true)
    expect(isCancelledOrCancellingStatus(TestRunStatus.CANCELLING)).toBe(true)
  })

  it('returns false for running', () => {
    expect(isCancelledOrCancellingStatus(TestRunStatus.RUNNING)).toBe(false)
  })
})

describe('buildTestRunsWhereClause', () => {
  it('returns empty object when no filter', () => {
    expect(buildTestRunsWhereClause(undefined)).toEqual({})
    expect(buildTestRunsWhereClause('')).toEqual({})
  })

  it('sets recentFailed window using RECENT_PERIOD_DAYS', () => {
    const before = Date.now()
    const clause = buildTestRunsWhereClause('recentFailed')
    const after = Date.now()
    expect(clause.result).toBe(TestRunResult.FAILED)
    expect(clause.completedAt).toMatchObject({ not: null })
    const gte = (clause.completedAt as { gte?: Date }).gte
    expect(gte).toBeInstanceOf(Date)
    const expected = new Date()
    expected.setDate(expected.getDate() - RECENT_PERIOD_DAYS)
    const diffMs = Math.abs(gte!.getTime() - expected.getTime())
    expect(diffMs).toBeLessThan(after - before + 2000)
  })
})

describe('testRunSchema', () => {
  it('parses minimal valid payload', () => {
    const parsed = testRunSchema.parse({
      name: 'Run',
      environmentId: 'env1',
      tags: [],
      browserEngine: 'CHROMIUM',
      testSuites: [{ testSuiteId: 'ts1', runAll: true, testCaseIds: [] }],
    })
    expect(parsed.name).toBe('Run')
  })
})
