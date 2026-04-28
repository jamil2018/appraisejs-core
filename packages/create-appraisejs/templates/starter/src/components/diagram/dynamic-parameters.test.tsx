// @vitest-environment jsdom

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StepParameterType } from '@prisma/client'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { InlineLocatorSaveResult } from '@/app/(base)/locators/create/create-locator-workspace-helpers'

import DynamicFormFields, { type DynamicFormFieldsRef } from './dynamic-parameters'

const { inlineSaveResult } = vi.hoisted(() => ({
  inlineSaveResult: {
    current: {
      locatorId: 'locator-2',
      locatorName: 'Sign in button',
      locatorGroupId: 'group-1',
      locatorGroupName: 'Login',
      selector: 'button[data-testid="sign-in"]',
      route: '/login',
      moduleId: 'module-1',
    } satisfies InlineLocatorSaveResult,
  },
}))

vi.mock('@/app/(base)/locators/create/create-locator-workspace', () => ({
  __esModule: true,
  default: ({ onSaveSuccess, onClose }: {
    onSaveSuccess?: (result: InlineLocatorSaveResult) => void
    onClose?: () => void
  }) => (
    <button
      type="button"
      onClick={() => {
        onSaveSuccess?.(inlineSaveResult.current)
        onClose?.()
      }}
    >
      Save Inline Locator
    </button>
  ),
}))

const locatorParam = {
  id: 'param-1',
  name: 'target',
  type: StepParameterType.LOCATOR,
  order: 1,
  templateStepId: 'step-1',
} as never

function renderLocatorFields({
  onChange = vi.fn(),
  onLocatorCreated = vi.fn(),
}: {
  onChange?: (values: Array<{ name: string; value: string; type: StepParameterType; order: number }>) => void
  onLocatorCreated?: (result: InlineLocatorSaveResult) => void
} = {}) {
  return render(
    <DynamicFormFields
      templateStepParams={[locatorParam]}
      locators={[{ id: 'locator-1', name: 'Login link', locatorGroupId: 'group-1' }]}
      locatorGroups={[{ id: 'group-1', name: 'Login', route: '/login', moduleId: 'module-1' }]}
      environments={[{ id: 'env-1', name: 'Staging' }]}
      modules={[{ id: 'module-1', name: 'Auth', parentId: null }]}
      onChange={onChange}
      onLocatorCreated={onLocatorCreated}
    />,
  )
}

describe('DynamicFormFields locator parameters', () => {
  beforeEach(() => {
    inlineSaveResult.current = {
      locatorId: 'locator-2',
      locatorName: 'Sign in button',
      locatorGroupId: 'group-1',
      locatorGroupName: 'Login',
      selector: 'button[data-testid="sign-in"]',
      route: '/login',
      moduleId: 'module-1',
    }
  })

  it('renders selector source dropdown and defaults to existing selector panel', () => {
    renderLocatorFields()

    expect(screen.getByRole('combobox', { name: 'Selector Source' })).toHaveTextContent('Use Existing')
    expect(screen.getAllByText('Use Existing').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Create Selector' })).not.toBeInTheDocument()
  })

  it('renders the create-new panel when selector source is new', async () => {
    const user = userEvent.setup()
    renderLocatorFields()

    await user.click(screen.getByRole('combobox', { name: 'Selector Source' }))
    await user.click(screen.getByRole('option', { name: 'Create New Selector' }))

    expect(screen.getAllByText('Create New Selector').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Create Selector' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Locator Group' })).toHaveAttribute('readonly')
    expect(screen.getByRole('textbox', { name: 'Locator' })).toHaveAttribute('readonly')
    expect(screen.queryByRole('combobox', { name: 'Locator Group' })).not.toBeInTheDocument()
  })

  it('keeps existing locator group then locator selection behavior', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderLocatorFields({ onChange })

    await user.click(screen.getByRole('combobox', { name: 'Locator Group' }))
    await user.click(screen.getByRole('option', { name: 'Login' }))
    await user.click(screen.getByRole('combobox', { name: /Locator$/ }))
    await user.click(screen.getByRole('option', { name: 'Login link' }))

    expect(onChange).toHaveBeenLastCalledWith([
      {
        name: 'target',
        value: 'Login link',
        type: StepParameterType.LOCATOR,
        order: 1,
      },
    ])
  })

  it('auto-selects an inline-created locator in an existing group', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onLocatorCreated = vi.fn()
    renderLocatorFields({ onChange, onLocatorCreated })

    await user.click(screen.getByRole('combobox', { name: 'Selector Source' }))
    await user.click(screen.getByRole('option', { name: 'Create New Selector' }))
    await user.click(screen.getByRole('button', { name: 'Create Selector' }))
    await user.click(screen.getByRole('button', { name: 'Save Inline Locator' }))

    expect(onLocatorCreated).toHaveBeenCalledWith(inlineSaveResult.current)
    expect(onChange).toHaveBeenLastCalledWith([
      {
        name: 'target',
        value: 'Sign in button',
        type: StepParameterType.LOCATOR,
        order: 1,
      },
    ])
    expect(screen.getByRole('textbox', { name: 'Locator Group' })).toHaveValue('Login')
    expect(screen.getByRole('textbox', { name: 'Locator' })).toHaveValue('Sign in button')
  })

  it('auto-selects an inline-created locator before the parent upserts options', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    inlineSaveResult.current = {
      locatorId: 'locator-3',
      locatorName: 'Account menu',
      locatorGroupId: 'group-2',
      locatorGroupName: 'Account',
      selector: '[data-testid="account-menu"]',
      route: '/account',
      moduleId: 'module-1',
    }

    renderLocatorFields({ onChange })

    await user.click(screen.getByRole('combobox', { name: 'Selector Source' }))
    await user.click(screen.getByRole('option', { name: 'Create New Selector' }))
    await user.click(screen.getByRole('button', { name: 'Create Selector' }))
    await user.click(screen.getByRole('button', { name: 'Save Inline Locator' }))

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Locator Group' })).toHaveValue('Account')
    })
    expect(screen.getByRole('textbox', { name: 'Locator' })).toHaveValue('Account menu')
    expect(onChange).toHaveBeenLastCalledWith([
      {
        name: 'target',
        value: 'Account menu',
        type: StepParameterType.LOCATOR,
        order: 1,
      },
    ])
  })

  it('adds and selects a newly created group and locator when the parent upserts options', async () => {
    const user = userEvent.setup()

    inlineSaveResult.current = {
      locatorId: 'locator-3',
      locatorName: 'Account menu',
      locatorGroupId: 'group-2',
      locatorGroupName: 'Account',
      selector: '[data-testid="account-menu"]',
      route: '/account',
      moduleId: 'module-1',
    }

    const onChange = vi.fn()

    function Harness() {
      const [locators, setLocators] = React.useState([
        { id: 'locator-1', name: 'Login link', locatorGroupId: 'group-1' },
      ])
      const [locatorGroups, setLocatorGroups] = React.useState([
        { id: 'group-1', name: 'Login', route: '/login', moduleId: 'module-1' },
      ])

      return (
        <DynamicFormFields
          templateStepParams={[locatorParam]}
          locators={locators}
          locatorGroups={locatorGroups}
          environments={[{ id: 'env-1', name: 'Staging' }]}
          modules={[{ id: 'module-1', name: 'Auth', parentId: null }]}
          onChange={onChange}
          onLocatorCreated={result => {
            setLocatorGroups(current => [
              ...current,
              {
                id: result.locatorGroupId,
                name: result.locatorGroupName,
                route: result.route,
                moduleId: result.moduleId,
              },
            ])
            setLocators(current => [
              ...current,
              {
                id: result.locatorId,
                name: result.locatorName,
                locatorGroupId: result.locatorGroupId,
              },
            ])
          }}
        />
      )
    }

    render(<Harness />)

    await user.click(screen.getByRole('combobox', { name: 'Selector Source' }))
    await user.click(screen.getByRole('option', { name: 'Create New Selector' }))
    await user.click(screen.getByRole('button', { name: 'Create Selector' }))
    await user.click(screen.getByRole('button', { name: 'Save Inline Locator' }))

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith([
        {
          name: 'target',
          value: 'Account menu',
          type: StepParameterType.LOCATOR,
          order: 1,
        },
      ])
    })

    expect(screen.getByRole('textbox', { name: 'Locator' })).toHaveValue('Account menu')

    await user.click(screen.getByRole('combobox', { name: 'Selector Source' }))
    await user.click(screen.getByRole('option', { name: 'Use Existing' }))
    await user.click(screen.getByRole('combobox', { name: 'Locator Group' }))
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: 'Account' })).toBeInTheDocument()
  })

  it('does not apply existing group validation while creating a new selector', async () => {
    const user = userEvent.setup()
    const formRef = React.createRef<DynamicFormFieldsRef>()

    render(
      <DynamicFormFields
        ref={formRef}
        templateStepParams={[locatorParam]}
        locators={[{ id: 'locator-1', name: 'Login link', locatorGroupId: 'group-1' }]}
        locatorGroups={[{ id: 'group-1', name: 'Login', route: '/login', moduleId: 'module-1' }]}
        environments={[{ id: 'env-1', name: 'Staging' }]}
        modules={[{ id: 'module-1', name: 'Auth', parentId: null }]}
      />,
    )

    await user.click(screen.getByRole('combobox', { name: 'Selector Source' }))
    await user.click(screen.getByRole('option', { name: 'Create New Selector' }))

    let isValid = true
    act(() => {
      isValid = formRef.current?.validate() ?? true
    })
    expect(isValid).toBe(false)
    expect(screen.queryByText('Locator group is required')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Locator is required')).toBeInTheDocument()
    })
  })
})
