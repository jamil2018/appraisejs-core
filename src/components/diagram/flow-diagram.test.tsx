// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import FlowDiagram, { parseStepInvocationInput } from './flow-diagram'
import type { StepDefinitionOption } from '@/types/step-definition-option'
import type { NodeData } from '@/types/diagram/diagram'

const definition: StepDefinitionOption = {
  reference: { id: 'browser.viewport.set', version: '1', definitionHash: 'sha256:definition' },
  title: 'Set viewport',
  description: 'Sets viewport dimensions.',
  signature: 'I set viewport {width} by {height} enabled {enabled} options {options} at {target}',
  keywordCompatibility: ['When'],
  groupId: 'browser',
  inputs: [
    { name: 'width', type: 'number', required: true },
    { name: 'height', type: 'number', required: true, defaultValue: 720 },
    { name: 'enabled', type: 'boolean', required: true, defaultValue: false },
    { name: 'options', type: 'json', required: true },
    { name: 'target', type: 'locator', required: false },
  ],
}

describe('typed Step Invocation input authoring', () => {
  it('preserves numeric timeout and viewport dimensions instead of stringifying them', () => {
    const number = { name: 'timeout', type: 'number' as const, required: true }
    expect(parseStepInvocationInput(number, '250')).toBe(250)
    expect(parseStepInvocationInput({ ...number, name: 'width' }, '1280')).toBe(1280)
    expect(parseStepInvocationInput({ ...number, name: 'height' }, '720')).toBe(720)
  })

  it('authors canonical typed invocation inputs, defaults, and required controls through the diagram', () => {
    const onNodeOrderChange = vi.fn()
    const Harness = () => {
      const [nodeOrder, setNodeOrder] = useState({})
      return (
        <FlowDiagram
          nodeOrder={nodeOrder}
          stepDefinitions={[definition]}
          locators={[]}
          locatorGroups={[]}
          environments={[]}
          modules={[]}
          onNodeOrderChange={next => {
            onNodeOrderChange(next)
            setNodeOrder(next)
          }}
        />
      )
    }
    render(
      <Harness />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
    let node = Object.values(onNodeOrderChange.mock.calls.at(-1)![0] as Record<string, NodeData>)[0]!
    expect(node.invocation.inputs).toMatchObject({ width: '', height: 720, enabled: false })
    expect(node.invocation.inputs).not.toHaveProperty('target')
    expect(screen.getByLabelText('width')).toBeRequired()
    fireEvent.change(screen.getByLabelText('width'), { target: { value: '1280' } })
    fireEvent.change(screen.getByLabelText('options'), { target: { value: '{"retries":2}' } })
    fireEvent.click(screen.getByLabelText('enabled'))
    fireEvent.change(screen.getByLabelText('target'), { target: { value: 'main-content' } })
    node = Object.values(onNodeOrderChange.mock.calls.at(-1)![0] as Record<string, NodeData>)[0]!
    expect(node.invocation.inputs).toEqual({
      width: 1280,
      height: 720,
      enabled: true,
      options: { retries: 2 },
      target: 'main-content',
    })
  })
})
