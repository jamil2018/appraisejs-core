import { BrowserEngine } from '@prisma/client'

export function getFieldErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return String(error)
}

export function getBrowserEngineOptions() {
  return [
    { label: 'Chromium', value: BrowserEngine.CHROMIUM },
    { label: 'Firefox', value: BrowserEngine.FIREFOX },
    { label: 'WebKit', value: BrowserEngine.WEBKIT },
  ] as const
}

export const testRunQuickTips = [
  {
    title: 'Choose a descriptive name',
    description: 'Use clear, specific names that indicate the purpose for your test run',
  },
  {
    title: 'Select the environment for your test run',
    description: 'Choose the environment that best suits your selected tests',
  },
  {
    title: 'Select the browser engine for your test run',
    description: 'Select the browser engine that is compatible with your selected test cases',
  },
  {
    title: 'Select the test suites or tags for your test run',
    description: 'You can filter by tags or browse suites and choose full suites or child subsets',
  },
  {
    title: 'Select the test workers count for your test run',
    description: 'Parallel workers can be used to run your test cases in parallel to speed up the test execution',
  },
] as const
