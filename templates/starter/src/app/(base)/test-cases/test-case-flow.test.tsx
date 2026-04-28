// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { StepParameterType } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NodeOrderMap, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'

import TestCaseFlow from './test-case-flow'

type MockFlowDiagramProps = {
  nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap
  onNodeOrderChange: (nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap) => void
  defaultValueInput?: boolean
}

const { flowDiagramRenderSpy } = vi.hoisted(() => ({
  flowDiagramRenderSpy: vi.fn<(props: MockFlowDiagramProps) => void>(),
}))

vi.mock('@/components/diagram/flow-diagram', () => ({
  __esModule: true,
  default: (props: MockFlowDiagramProps) => {
    flowDiagramRenderSpy(props)

    return (
      <div>
        <div data-testid="node-order">{JSON.stringify(props.nodeOrder)}</div>
        <div data-testid="default-value-input">{String(props.defaultValueInput)}</div>
        <button
          type="button"
          onClick={() =>
            props.onNodeOrderChange({
              'node-1': {
                order: 1,
                label: 'Click submit',
                parameters: [
                  {
                    name: 'target',
                    defaultValue: 'Submit',
                    type: StepParameterType.STRING,
                    order: 1,
                  },
                ],
                templateStepId: 'step-1',
              },
            })
          }
        >
          Emit Template Nodes
        </button>
      </div>
    )
  },
}))

describe('TestCaseFlow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    flowDiagramRenderSpy.mockClear()
  })

  it('normalizes template node updates and persists them after the debounce window', async () => {
    const onNodeOrderChange = vi.fn()

    render(
      <TestCaseFlow
        initialNodesOrder={{
          'node-1': {
            order: 1,
            label: 'Initial step',
            parameters: [],
            templateStepId: 'step-1',
          },
        }}
        templateStepParams={[]}
        templateSteps={[]}
        locators={[]}
        locatorGroups={[]}
        environments={[]}
        modules={[]}
        onNodeOrderChange={onNodeOrderChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Emit Template Nodes' }))

    expect(onNodeOrderChange).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(200)

    expect(onNodeOrderChange).toHaveBeenCalledWith({
      'node-1': {
        order: 1,
        label: 'Click submit',
        parameters: [
          {
            name: 'target',
            value: 'Submit',
            type: StepParameterType.STRING,
            order: 1,
          },
        ],
        templateStepId: 'step-1',
      },
    })
    expect(screen.getByTestId('default-value-input')).toHaveTextContent('false')
  })

})
