import { describe, expect, it, vi } from 'vitest'

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect,
}))

describe('Generate Test Case From Template page', () => {
  it('redirects legacy generate routes into the merged template wizard', async () => {
    const { default: GenerateTestCaseFromTemplate } = await import('./page')

    await GenerateTestCaseFromTemplate({ params: Promise.resolve({ id: 'template-1' }) })

    expect(redirect).toHaveBeenCalledWith('/test-cases/create-from-template?templateTestCaseId=template-1')
  })
})
