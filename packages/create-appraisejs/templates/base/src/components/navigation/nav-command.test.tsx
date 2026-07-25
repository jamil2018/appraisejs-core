// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import NavCommand from './nav-command'

const { push, getAllTestSuitesAction, getAllTestCasesAction, getAllTestRunsAction, getAllTemplateTestCasesAction } =
  vi.hoisted(() => ({
    push: vi.fn(),
    getAllTestSuitesAction: vi.fn(),
    getAllTestCasesAction: vi.fn(),
    getAllTestRunsAction: vi.fn(),
    getAllTemplateTestCasesAction: vi.fn(),
  }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
  }),
}))

vi.mock('@/actions/test-suite/test-suite-actions', () => ({
  getAllTestSuitesAction,
}))

vi.mock('@/actions/test-case/test-case-actions', () => ({
  getAllTestCasesAction,
}))

vi.mock('@/actions/test-run/test-run-actions', () => ({
  getAllTestRunsAction,
}))

vi.mock('@/actions/template-test-case/template-test-case-actions', () => ({
  getAllTemplateTestCasesAction,
}))

describe('NavCommand', () => {
  beforeEach(() => {
    push.mockReset()
    getAllTestSuitesAction.mockResolvedValue({ status: 200, data: [] })
    getAllTestCasesAction.mockResolvedValue({ status: 200, data: [] })
    getAllTestRunsAction.mockResolvedValue({ status: 200, data: [] })
    getAllTemplateTestCasesAction.mockResolvedValue({ status: 200, data: [] })
  })

  it('opens with the keyboard shortcut and navigates to a static route', async () => {
    const user = userEvent.setup()

    render(<NavCommand />)

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    await user.click(await screen.findByText('Settings'))

    expect(push).toHaveBeenCalledWith('/settings')
  })

  it('clears the active search mode when backspace is pressed on an empty search input', async () => {
    const user = userEvent.setup()

    render(<NavCommand />)

    await user.click(screen.getByRole('button', { name: 'Open Command Palette' }))
    await user.click(screen.getByText('Search Test Cases'))

    const searchInput = screen.getByPlaceholderText('Search Test Case by Title...')
    expect(screen.getByRole('button', { name: 'Clear Search Test Case' })).toBeInTheDocument()

    fireEvent.keyDown(searchInput, { key: 'Backspace' })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a command or search...')).toBeInTheDocument()
    })
  })

  it('loads search results and navigates to the selected entity', async () => {
    const user = userEvent.setup()

    getAllTestCasesAction.mockResolvedValue({
      status: 200,
      data: [{ id: 'case-1', title: 'Login case' }],
    })

    render(<NavCommand />)

    await user.click(screen.getByRole('button', { name: 'Open Command Palette' }))
    await user.click(screen.getByText('Search Test Cases'))
    await user.click(await screen.findByText('Login case'))

    expect(push).toHaveBeenCalledWith('/test-cases/modify/case-1')
  })
})
