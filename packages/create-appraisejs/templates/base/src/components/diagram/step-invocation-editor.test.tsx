// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { StepInvocationEditor } from './step-invocation-editor'
import { useStepInvocationResources } from './step-invocation-resources'
import type { StepDefinitionOption } from '@/types/step-definition-option'

vi.mock('@/app/(base)/locators/create/create-locator-workspace', () => ({
  default: ({ onSaveSuccess }: { onSaveSuccess: (result: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSaveSuccess({
          locatorId: 'created-locator',
          locatorName: 'Created sign in button',
          locatorGroupId: 'created-group',
          locatorGroupName: 'Created login',
          selector: 'role=button[name=Sign in]',
          route: '/login',
          moduleId: 'auth',
        })
      }
    >
      Save Inline Locator
    </button>
  ),
}))

const definition: StepDefinitionOption = {
  reference: { id: 'browser.navigation.goto', version: '1', definitionHash: 'sha256:ready' },
  title: 'Navigate to URL',
  description: 'Navigates.',
  signature: 'I navigate to {url}',
  keywordCompatibility: ['When'],
  groupId: 'browser',
  inputs: [
    { name: 'url', type: 'string', required: true },
    { name: 'enabled', type: 'boolean', required: false },
  ],
}

function chooseSelectOption(label: string, option: string | RegExp) {
  fireEvent.click(screen.getByRole('combobox', { name: label }))
  fireEvent.click(screen.getByRole('option', { name: option }))
}

describe('StepInvocationEditor', () => {
  it('focuses the first field and omits an untouched optional boolean on keyboard form submission', () => {
    const onSave = vi.fn()
    render(
      <StepInvocationEditor
        title="Edit step invocation"
        definition={definition}
        values={{ url: '/' }}
        errors={{}}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onErrorsChange={vi.fn()}
        onSave={onSave}
      />,
    )

    expect(screen.getByLabelText('url')).toHaveFocus()
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
    expect(onSave).toHaveBeenCalledWith({ url: '/' })
  })

  it('keeps invalid JSON in the editor and does not call save', () => {
    const jsonDefinition: StepDefinitionOption = {
      ...definition,
      inputs: [{ name: 'options', type: 'json', required: true }],
    }
    const onSave = vi.fn()
    const Harness = () => {
      const [values, setValues] = useState<Record<string, unknown>>({ options: '{' })
      const [errors, setErrors] = useState<Record<string, string>>({})
      return (
        <StepInvocationEditor
          title="Edit step invocation"
          definition={jsonDefinition}
          values={values}
          errors={errors}
          onCancel={vi.fn()}
          onChange={(name, value) => setValues(current => ({ ...current, [name]: value }))}
          onErrorsChange={setErrors}
          onSave={onSave}
        />
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByLabelText('options')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('typed locator and environment references', () => {
  const locatorDefinition: StepDefinitionOption = {
    ...definition,
    inputs: [
      { name: 'target', type: 'locator', required: true },
      { name: 'environment', type: 'environment-ref', required: false },
    ],
  }
  const resources = {
    locators: [{ id: 'sign-in', name: 'Sign in button', locatorGroupId: 'login' }],
    locatorGroups: [{ id: 'login', name: 'Login', route: '/login', moduleId: 'auth' }],
    environments: [{ id: 'local', name: 'Local' }],
    modules: [{ id: 'auth', name: 'Auth', parentId: null }],
  }

  it('selects locator IDs within a group and retains environment reference IDs', () => {
    const onChange = vi.fn()
    render(
      <StepInvocationEditor
        title="Edit step invocation"
        definition={locatorDefinition}
        values={{}}
        errors={{}}
        onCancel={vi.fn()}
        onChange={onChange}
        onErrorsChange={vi.fn()}
        onSave={vi.fn()}
        resources={resources}
      />,
    )

    expect(screen.getByRole('combobox', { name: 'Locator' })).toBeDisabled()
    chooseSelectOption('Locator group', 'Login')
    expect(screen.getByRole('combobox', { name: 'Locator' })).toBeEnabled()
    chooseSelectOption('Locator', 'Sign in button')
    chooseSelectOption('environment', 'Local')
    expect(onChange).toHaveBeenCalledWith('target', 'sign-in')
    expect(onChange).toHaveBeenCalledWith('environment', 'local')
  })

  it('creates a locator through the canonical inline workspace and selects its reference immediately', async () => {
    const onChange = vi.fn()
    const Harness = () => {
      const [values, setValues] = useState<Record<string, unknown>>({})
      const invocationResources = useStepInvocationResources(resources)
      return (
        <StepInvocationEditor
          title="Edit step invocation"
          definition={locatorDefinition}
          values={values}
          errors={{}}
          onCancel={vi.fn()}
          onChange={(name, value) => {
            onChange(name, value)
            setValues(current => ({ ...current, [name]: value }))
          }}
          onErrorsChange={vi.fn()}
          onSave={vi.fn()}
          resources={invocationResources}
        />
      )
    }
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Open locator picker' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Inline Locator' }))
    expect(onChange).toHaveBeenCalledWith('target', 'created-locator')
    expect(await screen.findByText('Using created locator: Created sign in button')).toBeVisible()
  })

  it('uses a labeled checkbox that explains its active and inactive values', () => {
    const onChange = vi.fn()
    render(
      <StepInvocationEditor
        title="Edit step invocation"
        definition={definition}
        values={{ url: '/' }}
        errors={{}}
        onCancel={vi.fn()}
        onChange={onChange}
        onErrorsChange={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    const enabled = screen.getByRole('checkbox', { name: 'enabled' })
    expect(screen.getByText('enabled')).toHaveAttribute('for', 'invocation-enabled')
    expect(enabled).not.toBeChecked()
    expect(screen.getByText('Expect active when selected; expect inactive when clear.')).toBeVisible()
    fireEvent.click(enabled)
    expect(onChange).toHaveBeenCalledWith('enabled', true)
  })
})
