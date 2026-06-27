// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { StepParameterType } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NodeOrderMap, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'

import TemplateTestCaseFlow from './template-test-case-flow'

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
                label: 'Fill email',
                parameters: [
                  {
                    name: 'value',
                    value: 'qa@appraise.dev',
                    type: StepParameterType.STRING,
                    order: 1,
                  },
                ],
                templateStepId: 'step-1',
              },
            })
          }
        >
          Emit Runtime Nodes
        </button>
      </div>
    )
  },
}))

describe('TemplateTestCaseFlow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    flowDiagramRenderSpy.mockClear()
  })

  it('normalizes runtime node updates into default values and persists them after the debounce window', async () => {
    const onNodeOrderChange = vi.fn()

    render(
      <TemplateTestCaseFlow
        initialNodesOrder={{
          'node-1': {
            order: 1,
            label: 'Initial template step',
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
        defaultValueInput
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Emit Runtime Nodes' }))

    expect(onNodeOrderChange).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(200)

    expect(onNodeOrderChange).toHaveBeenCalledWith({
      'node-1': {
        order: 1,
        label: 'Fill email',
        parameters: [
          {
            name: 'value',
            defaultValue: 'qa@appraise.dev',
            type: StepParameterType.STRING,
            order: 1,
          },
        ],
        templateStepId: 'step-1',
      },
    })
    expect(screen.getByTestId('default-value-input')).toHaveTextContent('true')
  })
})
