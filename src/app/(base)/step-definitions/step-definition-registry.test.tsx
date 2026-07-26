// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StepDefinitionRegistry } from './step-definition-registry'
import type { StepDefinitionOption } from '@/types/step-definition-option'

const mocks = vi.hoisted(() => ({
  createVersion: vi.fn(),
  deleteDraft: vi.fn(),
  deprecate: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}))
vi.mock('@/actions/step-definition/step-definition-actions', () => ({
  createStepDefinitionVersionDraftAction: mocks.createVersion,
  deleteStepDefinitionDraftAction: mocks.deleteDraft,
  deprecateStepDefinitionAction: mocks.deprecate,
}))

const definitions: StepDefinitionOption[] = [
  {
    reference: { id: 'browser.navigation.goto', version: '1', definitionHash: 'sha256:goto' },
    title: 'Open a page',
    description: 'Navigates to a URL.',
    signature: 'open {url}',
    keywordCompatibility: ['Given', 'When'],
    groupId: 'navigation',
    inputs: [{ name: 'url', type: 'string' as const, required: true }],
    sourceOwned: false,
  },
  {
    reference: { id: 'browser.assertions.visible', version: '1', definitionHash: 'sha256:visible' },
    title: 'Check visibility',
    description: 'Checks that a locator is visible.',
    signature: '{locator} is visible',
    keywordCompatibility: ['Then'],
    groupId: 'assertions',
    inputs: [{ name: 'locator', type: 'locator' as const, required: true }],
    sourceOwned: false,
  },
]

describe('StepDefinitionRegistry', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters ready definitions by title, ID, signature, or group', async () => {
    const user = userEvent.setup()
    render(<StepDefinitionRegistry definitions={definitions} drafts={[]} />)

    expect(screen.getByText('Open a page')).toBeInTheDocument()
    expect(screen.getByText('Check visibility')).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Search Step Definitions' }), 'assertions')

    expect(screen.queryByText('Open a page')).not.toBeInTheDocument()
    expect(screen.getByText('Check visibility')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 2')
  })

  it('shows a useful zero-result state', async () => {
    const user = userEvent.setup()
    render(<StepDefinitionRegistry definitions={definitions} drafts={[]} />)

    await user.type(screen.getByRole('searchbox', { name: 'Search Step Definitions' }), 'missing operation')

    expect(screen.getByText(/No Step Definitions match/)).toBeInTheDocument()
  })

  it('resumes and deletes human drafts with optimistic revision protection', async () => {
    const user = userEvent.setup()
    mocks.deleteDraft.mockResolvedValue({ status: 200, success: true, data: { id: 'draft-1' } })
    render(
      <StepDefinitionRegistry
        definitions={definitions}
        drafts={[
          {
            id: '00000000-0000-4000-8000-000000000001',
            proposedStepId: 'custom.open',
            proposedVersion: '2',
            revision: 4,
            title: 'Open a page v2',
            updatedAt: '2026-07-26T00:00:00.000Z',
          },
        ]}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(mocks.push).toHaveBeenCalledWith('/step-definitions/drafts/00000000-0000-4000-8000-000000000001')

    await user.click(screen.getByRole('button', { name: 'Delete draft Open a page v2' }))
    await user.click(screen.getByRole('button', { name: 'Delete draft' }))
    expect(mocks.deleteDraft).toHaveBeenCalledWith({
      draftId: '00000000-0000-4000-8000-000000000001',
      expectedRevision: 4,
    })
    expect(mocks.refresh).toHaveBeenCalled()
  })
})
