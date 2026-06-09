// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TemplateStepGroupType, TemplateStepIcon, TemplateStepType } from '@prisma/client'
import React from 'react'
import { describe, expect, it } from 'vitest'

import TemplateStepCombobox from './template-step-combobox'
import type { TemplateStepWithGroup } from '@/types/diagram/template-step'

function buildTemplateStep(step: Partial<TemplateStepWithGroup> = {}): TemplateStepWithGroup {
  const groupId = step.templateStepGroupId ?? 'group-actions'
  return {
    id: step.id ?? 'step-1',
    name: step.name ?? 'Click button',
    description: step.description ?? 'Clicks the target button',
    signature: step.signature ?? 'click {string}',
    functionDefinition: step.functionDefinition ?? '',
    type: step.type ?? TemplateStepType.ACTION,
    icon: step.icon ?? TemplateStepIcon.MOUSE,
    templateStepGroupId: groupId,
    createdAt: step.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: step.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
    templateStepGroup: step.templateStepGroup ?? {
      id: groupId,
      name: 'actions',
      description: null,
      type: TemplateStepGroupType.ACTION,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    parameters: step.parameters ?? [
      { id: 'param-target', name: 'target' },
      { id: 'param-timeout', name: 'timeoutMs' },
    ],
  }
}

function renderCombobox(templateSteps: TemplateStepWithGroup[]) {
  const TestHarness = () => {
    const [value, setValue] = React.useState('')

    return <TemplateStepCombobox value={value} onValueChange={setValue} templateSteps={templateSteps} />
  }

  return render(<TestHarness />)
}

describe('TemplateStepCombobox', () => {
  it('renders grouped rich options and shows a richer selected preview', async () => {
    const user = userEvent.setup()

    renderCombobox([
      buildTemplateStep(),
      buildTemplateStep({
        id: 'step-2',
        name: 'Validate response',
        description: 'Checks the response status code',
        icon: TemplateStepIcon.VALIDATION,
        type: TemplateStepType.ASSERTION,
        templateStepGroupId: 'group-assertions',
        templateStepGroup: {
          id: 'group-assertions',
          name: 'assertions',
          description: null,
          type: TemplateStepGroupType.VALIDATION,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        parameters: [{ id: 'param-status', name: 'expectedStatus' }],
      }),
    ])

    await user.click(screen.getByRole('combobox'))

    expect(screen.getByText('Actions')).toBeInTheDocument()
    expect(screen.getByText('Assertions')).toBeInTheDocument()

    const clickItem = screen.getByText('Click button').closest('[cmdk-item]')
    expect(clickItem).not.toBeNull()
    expect(clickItem?.querySelector('svg')).not.toBeNull()
    expect(within(clickItem as HTMLElement).getByText('Clicks the target button')).toBeInTheDocument()
    expect(within(clickItem as HTMLElement).getByText('Target')).toBeInTheDocument()
    expect(within(clickItem as HTMLElement).getByText('Timeout Ms')).toBeInTheDocument()

    await user.click(screen.getByText('Validate response'))

    const combobox = screen.getByRole('combobox')
    expect(combobox.querySelector('svg')).not.toBeNull()
    expect(within(combobox).getByText('Validate response')).toBeInTheDocument()
    expect(within(combobox).getByText('Checks the response status code')).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('matches search terms from description, group name, and parameter names', async () => {
    const user = userEvent.setup()

    renderCombobox([
      buildTemplateStep(),
      buildTemplateStep({
        id: 'step-2',
        name: 'Validate response',
        description: 'Checks the response status code',
        icon: TemplateStepIcon.VALIDATION,
        type: TemplateStepType.ASSERTION,
        templateStepGroupId: 'group-assertions',
        templateStepGroup: {
          id: 'group-assertions',
          name: 'assertions',
          description: null,
          type: TemplateStepGroupType.VALIDATION,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        parameters: [{ id: 'param-status', name: 'expectedStatus' }],
      }),
    ])

    await user.click(screen.getByRole('combobox'))

    const searchInput = screen.getByPlaceholderText('Search template steps…')

    await user.type(searchInput, 'status code')
    expect(screen.getByText('Validate response')).toBeInTheDocument()
    expect(screen.queryByText('Click button')).not.toBeInTheDocument()

    await user.clear(searchInput)
    await user.type(searchInput, 'assertions')
    expect(screen.getByText('Validate response')).toBeInTheDocument()

    await user.clear(searchInput)
    await user.type(searchInput, 'expectedStatus')
    expect(screen.getByText('Validate response')).toBeInTheDocument()
  })

  it('ranks exact name matches above weaker keyword matches', async () => {
    const user = userEvent.setup()

    renderCombobox([
      buildTemplateStep({
        id: 'step-fill',
        name: 'Fill',
        description: 'Fill an input field',
        icon: TemplateStepIcon.INPUT,
      }),
      buildTemplateStep({
        id: 'step-assertion',
        name: 'Validate profile',
        description: 'Checks that a field is filled',
        icon: TemplateStepIcon.VALIDATION,
        type: TemplateStepType.ASSERTION,
        templateStepGroupId: 'group-assertions',
        templateStepGroup: {
          id: 'group-assertions',
          name: 'assertions',
          description: null,
          type: TemplateStepGroupType.VALIDATION,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      }),
    ])

    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByPlaceholderText('Search template steps…'), 'fill')

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(within(options[0] as HTMLElement).getByText('Fill')).toBeInTheDocument()
  })
})
