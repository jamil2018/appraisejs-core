// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FlowDiagramBlockDialog } from './flow-diagram-block-dialog'

describe('FlowDiagramBlockDialog', () => {
  it('renders the create action with a save icon', () => {
    render(
      <FlowDiagramBlockDialog
        open={true}
        onOpenChange={vi.fn()}
        editingBlockId={null}
        blockName="Login flow"
        onBlockNameChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    const createButton = screen.getByRole('button', { name: 'Create' })

    expect(createButton).toBeInTheDocument()
    expect(createButton.querySelector('svg')).toBeInTheDocument()
  })
})
