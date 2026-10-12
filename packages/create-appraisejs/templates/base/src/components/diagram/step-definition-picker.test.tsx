// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StepDefinitionPicker } from './step-definition-picker'

const definitions = Array.from({ length: 12 }, (_, index) => ({
  reference: {
    id: `browser.example.${index}`,
    version: '1',
    definitionHash: `sha256:${index}`,
  },
  title: `Example ${index}`,
  description: `Example definition ${index}`,
  signature: `the user performs example ${index}`,
  keywordCompatibility: ['When' as const],
  groupId: 'browser',
  inputs: [],
}))

describe('StepDefinitionPicker', () => {
  it('keeps the cmdk list as the single styled scroll owner', () => {
    const { container } = render(
      <StepDefinitionPicker definitions={definitions} onChange={vi.fn()} id="definition-picker" />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'Step Definition results' }))

    const list = screen.getByRole('listbox')
    expect(list).toHaveClass('overflow-y-auto', 'overscroll-contain')
    expect(list.className).toContain('scrollbar-color')
    expect(container.ownerDocument.querySelector('[data-radix-scroll-area-viewport]')).not.toBeInTheDocument()

    fireEvent.wheel(list, { deltaY: 240 })
    expect(list).toHaveProperty('scrollTop', 240)
  })
})
