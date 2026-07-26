// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listDrafts: vi.fn(),
  listReady: vi.fn(),
}))

vi.mock('@/actions/step-definition/step-definition-actions', () => ({
  listReadyStepDefinitionOptionsAction: mocks.listReady,
  listStepDefinitionDraftsAction: mocks.listDrafts,
}))
vi.mock('./step-definition-registry', () => ({
  StepDefinitionRegistry: ({ definitions, drafts }: { definitions: unknown[]; drafts: unknown[] }) => (
    <div>
      Registry: {definitions.length} ready, {drafts.length} drafts
    </div>
  ),
}))

import StepDefinitionsPage from './page'

beforeEach(() => vi.clearAllMocks())

describe('StepDefinitionsPage', () => {
  it('renders ready definitions and resumable drafts together', async () => {
    mocks.listReady.mockResolvedValue({ status: 200, success: true, data: [{ reference: { id: 'custom.open' } }] })
    mocks.listDrafts.mockResolvedValue({ status: 200, success: true, data: [{ id: 'draft-1' }] })

    render(await StepDefinitionsPage())

    expect(screen.getByText('Registry: 1 ready, 1 drafts')).toBeInTheDocument()
  })

  it('renders the creation empty state only when both collections are empty', async () => {
    mocks.listReady.mockResolvedValue({ status: 200, success: true, data: [] })
    mocks.listDrafts.mockResolvedValue({ status: 200, success: true, data: [] })

    render(await StepDefinitionsPage())

    expect(screen.getByText('No ready Step Definitions found')).toBeInTheDocument()
  })

  it('renders a bounded error when either collection fails', async () => {
    mocks.listReady.mockResolvedValue({ status: 500, success: false, error: 'Registry unavailable.' })
    mocks.listDrafts.mockResolvedValue({ status: 200, success: true, data: [] })

    render(await StepDefinitionsPage())

    expect(screen.getByRole('alert')).toHaveTextContent('Registry unavailable.')
  })
})
