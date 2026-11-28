// @vitest-environment jsdom

import { webcrypto } from 'node:crypto'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace, refresh: mocks.refresh }),
}))
vi.mock('@/actions/conversation/conversation-actions', () => ({ submitConversationMessage: mocks.submit }))
vi.mock('../quality-journeys/[journeyId]/journey-status-observation', () => ({
  useJourneyStatusFreshness: () => ({ newerVersionAvailable: false }),
}))

import { ConversationComposer } from './conversation-composer'

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('announces a held save while keeping the message focused and submitting once', async () => {
  let complete!: (result: { success: true; conversationId: string }) => void
  mocks.submit.mockImplementation(() => new Promise(resolve => (complete = resolve)))
  const user = userEvent.setup()
  render(<ConversationComposer projectId="project-1" />)
  const message = screen.getByRole('textbox', { name: 'Message' })
  await user.type(message, 'Find checkout cases')
  await user.keyboard('{Enter}')

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saving message…'))
  expect(message).toHaveFocus()
  expect(message).toHaveAttribute('readonly')
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  await user.keyboard('{Enter}')
  expect(mocks.submit).toHaveBeenCalledOnce()

  await act(async () => complete({ success: true, conversationId: 'conversation-1' }))
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/conversations/conversation-1?project=project-1'))
  expect(mocks.submit).toHaveBeenCalledOnce()
})
