import { readFile } from 'fs/promises'
import { StepKeyword, StepStatus } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStepKeywordEnum, getStepStatusEnum, parseCucumberReport } from '@/lib/test-run/report-parser'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}))

describe('parseCucumberReport', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('maps cucumber features, hooks, errors, and screenshot attachments', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(
      JSON.stringify([
        {
          description: 'Feature description',
          elements: [
            {
              description: 'Scenario description',
              id: 'checkout;pay-with-card',
              keyword: 'Scenario',
              line: 7,
              name: 'Pay with card',
              steps: [
                {
                  keyword: 'Before',
                  result: { duration: 1, status: 'passed' },
                },
                {
                  embeddings: [
                    {
                      data: JSON.stringify({ screenshotPath: 'screenshots/pay-card.png' }),
                      mime_type: 'application/vnd.appraisejs.report-step-screenshot+json',
                    },
                  ],
                  keyword: 'Given ',
                  line: 9,
                  match: { location: 'steps/payment.ts:12' },
                  name: 'I am on checkout',
                  result: {
                    duration: 10,
                    error_message: 'Expected checkout page\n    at steps/payment.ts:12:3',
                    status: 'failed',
                  },
                },
              ],
              tags: [{ line: 6, name: '@tc_pay' }],
              type: 'scenario',
            },
          ],
          id: 'checkout',
          keyword: 'Feature',
          line: 1,
          name: 'Checkout',
          tags: [{ line: 1, name: '@ts_checkout' }],
          uri: 'features/checkout.feature',
        },
      ]),
    )

    const report = await parseCucumberReport('/tmp/cucumber.json')

    expect(report.features[0]).toMatchObject({
      description: 'Feature description',
      keyword: 'Feature',
      line: 1,
      name: 'Checkout',
      scenarios: [
        {
          cucumberId: 'checkout;pay-with-card',
          hooks: [{ duration: 1, hidden: false, keyword: 'Before', status: 'passed' }],
          name: 'Pay with card',
          steps: [
            {
              duration: 10,
              errorMessage: 'Expected checkout page',
              errorTrace: 'at steps/payment.ts:12:3',
              keyword: 'Given',
              line: 9,
              matchLocation: 'steps/payment.ts:12',
              name: 'I am on checkout',
              order: 1,
              screenshotPath: 'screenshots/pay-card.png',
              status: 'failed',
            },
          ],
        },
      ],
      tags: [{ line: 1, name: '@ts_checkout' }],
      uri: 'features/checkout.feature',
    })
  })

  it('wraps read and parse failures with report path context', async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error('permission denied'))

    await expect(parseCucumberReport('/tmp/missing.json')).rejects.toThrow(
      'Failed to parse cucumber report at /tmp/missing.json: permission denied',
    )
  })
})

describe('report parser enum helpers', () => {
  it('maps unknown statuses and keywords to safe defaults', () => {
    expect(getStepStatusEnum('passed')).toBe(StepStatus.PASSED)
    expect(getStepStatusEnum('unknown')).toBe(StepStatus.PENDING)
    expect(getStepKeywordEnum(' Then ')).toBe(StepKeyword.THEN)
    expect(getStepKeywordEnum('Eventually')).toBe(StepKeyword.GIVEN)
  })
})
