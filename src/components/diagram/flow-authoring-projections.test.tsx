// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useCallback, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xyflow/react', () => ({
  Handle: ({ type, ...props }: { type: string }) => <div data-handle-type={type} {...props} />,
  Position: { Left: 'left', Right: 'right' },
  Background: () => null,
  Controls: () => null,
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ReactFlow: ({
    children,
    nodes,
    nodeTypes,
  }: {
    children: ReactNode
    nodes: Array<{ id: string; type: string; data: unknown }>
    nodeTypes: Record<string, ComponentType<{ id: string; data: unknown }>>
  }) => (
    <div>
      {nodes.map(node => {
        const NodeComponent = nodeTypes[node.type]!
        return <NodeComponent key={node.id} id={node.id} data={node.data} />
      })}
      {children}
    </div>
  ),
}))

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
          route: '/login',
          moduleId: 'auth',
        })
      }
    >
      Save Inline Locator
    </button>
  ),
}))

import TestCaseFlow from '@/app/(base)/test-cases/test-case-flow'
import { getConvertedTemplateTestCaseData } from '@/app/(base)/test-cases/create-from-template/create-from-template-helpers'
import type { TemplateTestCaseWithSteps } from '@/app/(base)/test-cases/create-from-template/create-from-template-types'
import TemplateTestCaseFlow from '@/app/(base)/template-test-cases/template-test-case-flow'
import {
  createAuthoredFlowNode,
  createTemplateAuthoredFlowNode,
  flowFromNodeOrder,
  nodeOrderFromFlow,
  updateFlowInvocation,
  type AuthoredFlow,
} from './authored-flow-model'
import { useFlowInvocationController } from './flow-invocation-controller'
import { useStepInvocationResources } from './step-invocation-resources'
import type { NodeOrderMap, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'
import type { StepDefinitionOption } from '@/types/step-definition-option'

const definition: StepDefinitionOption = {
  reference: { id: 'browser.viewport.set', version: '1', definitionHash: 'sha256:ready' },
  title: 'Set viewport',
  description: 'Sets a viewport.',
  signature: 'I set the viewport to {width}',
  keywordCompatibility: ['When'],
  groupId: 'browser',
  inputs: [{ name: 'width', type: 'number', required: true, defaultValue: 1280 }],
}

const resources = { locators: [], locatorGroups: [], environments: [], modules: [] }

const locatorDefinition: StepDefinitionOption = {
  ...definition,
  reference: { id: 'browser.locator.click', version: '1', definitionHash: 'sha256:locator' },
  title: 'Click locator',
  signature: 'I click {target}',
  inputs: [{ name: 'target', type: 'locator', required: true }],
}

const jsonDefinition: StepDefinitionOption = {
  ...definition,
  reference: { id: 'browser.options.set', version: '1', definitionHash: 'sha256:json' },
  title: 'Set options',
  signature: 'I set options {options}',
  inputs: [{ name: 'options', type: 'json', required: true }],
}

const deprecatedDefinition: StepDefinitionOption = {
  ...definition,
  reference: { id: 'browser.viewport.legacy', version: '1', definitionHash: 'sha256:deprecated' },
  title: 'Deprecated viewport',
  description: 'A deprecated persisted viewport definition.',
}

const deprecatedTemplateDefinition: StepDefinitionOption = {
  ...deprecatedDefinition,
  reference: { ...deprecatedDefinition.reference, definitionHash: `sha256:${'d'.repeat(64)}` },
}

describe('flow authoring projections', () => {
  it('keeps an invalid invocation draft and its error while switching graph and linear projections', async () => {
    const node = createAuthoredFlowNode(definition, 'viewport')
    const Harness = () => {
      const [view, setView] = useState<'graph' | 'linear'>('graph')
      const [nodesOrder, setNodesOrder] = useState({ viewport: node } as NodeOrderMap)
      const flow = useMemo(() => flowFromNodeOrder(nodesOrder), [nodesOrder])
      const publish = useCallback((next: AuthoredFlow) => setNodesOrder(nodeOrderFromFlow(next) as NodeOrderMap), [])
      const invocationController = useFlowInvocationController({ flow, definitions: [definition], publish })
      return (
        <>
          <button type="button" onClick={() => setView('graph')}>
            Graph
          </button>
          <button type="button" onClick={() => setView('linear')}>
            Linear
          </button>
          <TestCaseFlow
            initialNodesOrder={nodesOrder}
            stepDefinitions={[definition]}
            resources={resources}
            onNodeOrderChange={setNodesOrder}
            invocationController={invocationController}
            view={view}
          />
        </>
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('width')).toHaveFocus()
    fireEvent.change(screen.getByLabelText('width'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(screen.getByText('width is required.')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Linear' }))
    expect(screen.getByLabelText('Linear step editor')).toBeVisible()
    expect(screen.getByRole('dialog', { name: 'Edit step invocation' })).toBeVisible()
    expect(screen.getByLabelText('width')).toHaveValue(null)
    expect(screen.getByText('width is required.')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Graph' }))
    expect(screen.getByLabelText('Graph step editor')).toBeVisible()
    expect(screen.getByText('width is required.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus())
  })

  it('preserves raw invalid JSON drafts across Graph and Linear remounts and persists valid JSON as an object', () => {
    const seededNode = updateFlowInvocation(
      [{ nodeId: 'options', node: createAuthoredFlowNode(jsonDefinition, 'options') }],
      'options',
      jsonDefinition,
      { options: { seeded: true } },
    )[0]!.node
    const Harness = () => {
      const [view, setView] = useState<'graph' | 'linear'>('graph')
      const [nodesOrder, setNodesOrder] = useState({ options: seededNode } as NodeOrderMap)
      const flow = useMemo(() => flowFromNodeOrder(nodesOrder), [nodesOrder])
      const publish = useCallback((next: AuthoredFlow) => setNodesOrder(nodeOrderFromFlow(next) as NodeOrderMap), [])
      const controller = useFlowInvocationController({ flow, definitions: [jsonDefinition], publish })
      return (
        <>
          <button type="button" onClick={() => setView('graph')}>
            Graph
          </button>
          <button type="button" onClick={() => setView('linear')}>
            Linear
          </button>
          <TestCaseFlow
            initialNodesOrder={nodesOrder}
            stepDefinitions={[jsonDefinition]}
            resources={resources}
            onNodeOrderChange={setNodesOrder}
            invocationController={controller}
            view={view}
          />
          <output aria-label="Persisted JSON">{JSON.stringify(nodesOrder.options.invocation.inputs.options)}</output>
        </>
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('options'), { target: { value: '{"draft":' } })
    expect(screen.getByLabelText('options')).toHaveValue('{"draft":')
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(screen.getByLabelText('options')).toHaveValue('{"draft":')
    expect(screen.getByLabelText('options')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Persisted JSON')).toHaveTextContent('{"seeded":true}')

    fireEvent.click(screen.getByRole('button', { name: 'Linear' }))
    expect(screen.getByLabelText('options')).toHaveValue('{"draft":')
    fireEvent.click(screen.getByRole('button', { name: 'Graph' }))
    expect(screen.getByLabelText('options')).toHaveValue('{"draft":')

    fireEvent.change(screen.getByLabelText('options'), { target: { value: '{"saved":true}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(screen.getByLabelText('Persisted JSON')).toHaveTextContent('{"saved":true}')
  })

  it('commits an edited invocation before an immediate parent save and reload', () => {
    const node = createAuthoredFlowNode(definition, 'viewport')
    const Harness = () => {
      const [nodesOrder, setNodesOrder] = useState({ viewport: node } as NodeOrderMap)
      const [savedNodesOrder, setSavedNodesOrder] = useState(nodesOrder)
      const [isReloaded, setIsReloaded] = useState(false)
      const activeNodesOrder = isReloaded ? savedNodesOrder : nodesOrder
      const flow = useMemo(() => flowFromNodeOrder(activeNodesOrder), [activeNodesOrder])
      const publish = useCallback((next: AuthoredFlow) => setNodesOrder(nodeOrderFromFlow(next) as NodeOrderMap), [])
      const invocationController = useFlowInvocationController({ flow, definitions: [definition], publish })

      return (
        <>
          <button type="button" onClick={() => setSavedNodesOrder(nodesOrder)}>
            Save form
          </button>
          <button type="button" onClick={() => setIsReloaded(true)}>
            Reload form
          </button>
          <TestCaseFlow
            key={isReloaded ? 'reloaded' : 'editing'}
            initialNodesOrder={activeNodesOrder}
            stepDefinitions={[definition]}
            resources={resources}
            onNodeOrderChange={setNodesOrder}
            invocationController={invocationController}
          />
        </>
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('width'), { target: { value: '1440' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(screen.getByText('When I set the viewport to 1440')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Save form' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reload form' }))

    expect(screen.getByText('When I set the viewport to 1440')).toBeVisible()
  })

  it('renders an inserted invocation immediately when a form-level controller owns the canonical flow', () => {
    const Harness = () => {
      const [nodesOrder, setNodesOrder] = useState({} as NodeOrderMap)
      const [view, setView] = useState<'graph' | 'linear'>('graph')
      const flow = useMemo(() => flowFromNodeOrder(nodesOrder), [nodesOrder])
      const publish = useCallback(
        (next: AuthoredFlow) => setNodesOrder(nodeOrderFromFlow(next) as NodeOrderMap),
        [setNodesOrder],
      )
      const controller = useFlowInvocationController({ flow, definitions: [definition], publish })
      return (
        <>
          <button type="button" onClick={() => setView('graph')}>
            Graph
          </button>
          <button type="button" onClick={() => setView('linear')}>
            Linear
          </button>
          <TestCaseFlow
            initialNodesOrder={nodesOrder}
            stepDefinitions={[definition]}
            resources={resources}
            onNodeOrderChange={setNodesOrder}
            invocationController={controller}
            view={view}
          />
        </>
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Insert first step' }))
    fireEvent.change(screen.getByLabelText('width'), { target: { value: '1280' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))

    expect(screen.getByText('When I set the viewport to 1280')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Linear' }))
    expect(screen.getByLabelText('Linear step editor')).toBeVisible()
    expect(screen.getByText('When I set the viewport to 1280')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Graph' }))
    expect(screen.getByLabelText('Graph step editor')).toBeVisible()
    expect(screen.getByText('When I set the viewport to 1280')).toBeVisible()
  })

  it('applies the same add, edit, reorder, and remove sequence through graph and linear projections', () => {
    const ProjectionHarness = ({ view }: { view: 'graph' | 'linear' }) => {
      const [nodesOrder, setNodesOrder] = useState({} as NodeOrderMap)
      const flow = useMemo(() => flowFromNodeOrder(nodesOrder), [nodesOrder])
      const publish = useCallback((next: AuthoredFlow) => setNodesOrder(nodeOrderFromFlow(next) as NodeOrderMap), [])
      const invocationController = useFlowInvocationController({ flow, definitions: [definition], publish })
      const canonicalOutput = Object.values(nodesOrder)
        .sort((left, right) => left.order - right.order)
        .map(node => ({ order: node.order, inputs: node.invocation.inputs }))
      return (
        <>
          <TestCaseFlow
            initialNodesOrder={nodesOrder}
            stepDefinitions={[definition]}
            resources={resources}
            onNodeOrderChange={setNodesOrder}
            invocationController={invocationController}
            view={view}
          />
          <output aria-label="Canonical output">{JSON.stringify(canonicalOutput)}</output>
        </>
      )
    }

    const graph = render(<ProjectionHarness view="graph" />)
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!)
    fireEvent.change(screen.getByLabelText('width'), { target: { value: '1440' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Move Set viewport left' })[1]!)
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove Set viewport' })[0]!)
    const graphOutput = screen.getByLabelText('Canonical output').textContent
    graph.unmount()

    render(<ProjectionHarness view="linear" />)
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!)
    fireEvent.change(screen.getByLabelText('width'), { target: { value: '1440' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Move Set viewport up' })[1]!)
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove Set viewport' })[0]!)
    expect(screen.getByLabelText('Canonical output')).toHaveTextContent(graphOutput ?? '')
  })

  it('retains inline-created locator resources after close, reopen, and graph-linear remounts', () => {
    const node = createAuthoredFlowNode(locatorDefinition, 'locator')
    const Harness = () => {
      const [view, setView] = useState<'graph' | 'linear'>('graph')
      const [nodesOrder, setNodesOrder] = useState({ locator: node } as NodeOrderMap)
      const flow = useMemo(() => flowFromNodeOrder(nodesOrder), [nodesOrder])
      const publish = useCallback((next: AuthoredFlow) => setNodesOrder(nodeOrderFromFlow(next) as NodeOrderMap), [])
      const invocationController = useFlowInvocationController({ flow, definitions: [locatorDefinition], publish })
      const invocationResources = useStepInvocationResources(resources)
      return (
        <>
          <button type="button" onClick={() => setView('graph')}>
            Graph
          </button>
          <button type="button" onClick={() => setView('linear')}>
            Linear
          </button>
          <TestCaseFlow
            initialNodesOrder={nodesOrder}
            stepDefinitions={[locatorDefinition]}
            resources={invocationResources}
            onNodeOrderChange={setNodesOrder}
            invocationController={invocationController}
            view={view}
          />
        </>
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Selector source'), { target: { value: 'new' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Selector' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Inline Locator' }))
    expect(screen.getByText('Using created locator: Created sign in button')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))

    fireEvent.click(screen.getByRole('button', { name: 'Linear' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('target')).toHaveValue('created-locator')
    expect(screen.getByLabelText('Locator group')).toHaveValue('created-group')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Graph' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('target')).toHaveValue('created-locator')
    expect(screen.getByLabelText('Locator group')).toHaveValue('created-group')
  })

  it('edits a persisted deprecated Test Case reference in Graph and Linear without offering it for Add', () => {
    const node = createAuthoredFlowNode(deprecatedDefinition, 'legacy')
    const Harness = () => {
      const [view, setView] = useState<'graph' | 'linear'>('graph')
      const [nodesOrder, setNodesOrder] = useState({ legacy: node } as NodeOrderMap)
      const flow = useMemo(() => flowFromNodeOrder(nodesOrder), [nodesOrder])
      const publish = useCallback((next: AuthoredFlow) => setNodesOrder(nodeOrderFromFlow(next) as NodeOrderMap), [])
      const controller = useFlowInvocationController({
        flow,
        definitions: [definition, deprecatedDefinition],
        readyDefinitions: [definition],
        publish,
      })
      return (
        <>
          <button type="button" onClick={() => setView('graph')}>
            Graph
          </button>
          <button type="button" onClick={() => setView('linear')}>
            Linear
          </button>
          <TestCaseFlow
            initialNodesOrder={nodesOrder}
            stepDefinitions={[definition]}
            resources={resources}
            onNodeOrderChange={setNodesOrder}
            invocationController={controller}
            view={view}
          />
          <output aria-label="Persisted Test Case reference">
            {JSON.stringify(Object.values(nodesOrder).map(item => item.invocation.step))}
          </output>
        </>
      )
    }

    render(<Harness />)
    expect(screen.queryByRole('option', { name: 'Deprecated viewport' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('dialog', { name: 'Edit step invocation' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(screen.getByLabelText('Persisted Test Case reference')).toHaveTextContent('browser.viewport.legacy')

    fireEvent.click(screen.getByRole('button', { name: 'Linear' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('dialog', { name: 'Edit step invocation' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(screen.queryByRole('option', { name: 'Deprecated viewport' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(screen.getByLabelText('Persisted Test Case reference')).toHaveTextContent('browser.viewport.set')
  })

  it('edits a persisted deprecated Template Test Case reference in Graph and Linear without offering it for Add', () => {
    const node = createTemplateAuthoredFlowNode(deprecatedDefinition, 'legacy')
    const Harness = () => {
      const [view, setView] = useState<'graph' | 'linear'>('graph')
      const [nodesOrder, setNodesOrder] = useState({ legacy: node } as TemplateTestCaseNodeOrderMap)
      const flow = useMemo(() => flowFromNodeOrder(nodesOrder), [nodesOrder])
      const publish = useCallback(
        (next: AuthoredFlow) => setNodesOrder(nodeOrderFromFlow(next) as TemplateTestCaseNodeOrderMap),
        [],
      )
      const controller = useFlowInvocationController({
        flow,
        definitions: [definition, deprecatedDefinition],
        readyDefinitions: [definition],
        publish,
        nodeKind: 'template-test-case',
      })
      return (
        <>
          <button type="button" onClick={() => setView('graph')}>
            Graph
          </button>
          <button type="button" onClick={() => setView('linear')}>
            Linear
          </button>
          <TemplateTestCaseFlow
            initialNodesOrder={nodesOrder}
            stepDefinitions={[definition]}
            resources={resources}
            onNodeOrderChange={next => setNodesOrder(next as TemplateTestCaseNodeOrderMap)}
            invocationController={controller}
            view={view}
          />
          <output aria-label="Persisted Template reference">
            {JSON.stringify(Object.values(nodesOrder).map(item => item.invocation.step))}
          </output>
        </>
      )
    }

    render(<Harness />)
    expect(screen.queryByRole('option', { name: 'Deprecated viewport' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('dialog', { name: 'Edit step invocation' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(screen.getByLabelText('Persisted Template reference')).toHaveTextContent('browser.viewport.legacy')

    fireEvent.click(screen.getByRole('button', { name: 'Linear' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('dialog', { name: 'Edit step invocation' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(screen.queryByRole('option', { name: 'Deprecated viewport' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(screen.getByLabelText('Persisted Template reference')).toHaveTextContent('browser.viewport.set')
  })

  it('keeps a deprecated create-from-template reference editable across Graph and Linear without offering it for Add', () => {
    const { convertedData } = getConvertedTemplateTestCaseData({
      id: 'template-legacy',
      name: 'Legacy viewport template',
      description: 'Uses a deprecated immutable Step Definition.',
      steps: [
        {
          id: 'template-step-legacy',
          flowNodeId: 'legacy',
          order: 1,
          label: deprecatedTemplateDefinition.title,
          gherkinStep: 'I set the legacy viewport',
          icon: 'MOUSE',
          invocationJson: JSON.stringify({
            step: deprecatedTemplateDefinition.reference,
            inputs: { width: 1280 },
            presentation: { keyword: 'When', description: 'I set the legacy viewport' },
          }),
          parameters: [],
        },
      ],
    } as unknown as TemplateTestCaseWithSteps)
    expect(convertedData).not.toBeNull()

    const Harness = () => {
      const [view, setView] = useState<'graph' | 'linear'>('graph')
      const [nodesOrder, setNodesOrder] = useState(convertedData!.nodesOrder)
      const flow = useMemo(() => flowFromNodeOrder(nodesOrder), [nodesOrder])
      const publish = useCallback((next: AuthoredFlow) => setNodesOrder(nodeOrderFromFlow(next) as NodeOrderMap), [])
      const controller = useFlowInvocationController({
        flow,
        definitions: [definition, deprecatedTemplateDefinition],
        readyDefinitions: [definition],
        publish,
      })
      return (
        <>
          <button type="button" onClick={() => setView('graph')}>
            Graph
          </button>
          <button type="button" onClick={() => setView('linear')}>
            Linear
          </button>
          <TestCaseFlow
            initialNodesOrder={nodesOrder}
            stepDefinitions={[definition]}
            resources={resources}
            onNodeOrderChange={setNodesOrder}
            invocationController={controller}
            view={view}
          />
          <output aria-label="Create from template reference">
            {JSON.stringify(Object.values(nodesOrder).map(item => item.invocation.step))}
          </output>
        </>
      )
    }

    render(<Harness />)
    expect(screen.queryByRole('option', { name: 'Deprecated viewport' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(screen.getByLabelText('Create from template reference')).toHaveTextContent('browser.viewport.legacy')

    fireEvent.click(screen.getByRole('button', { name: 'Linear' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(screen.queryByRole('option', { name: 'Deprecated viewport' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(screen.getByLabelText('Create from template reference')).toHaveTextContent('browser.viewport.set')
  })

  it('keeps template invocation parameters in defaultValue shape and blocks blank required insertion', () => {
    const Harness = () => {
      const [nodesOrder, setNodesOrder] = useState({} as TemplateTestCaseNodeOrderMap)
      const flow = useMemo(() => flowFromNodeOrder(nodesOrder), [nodesOrder])
      const publish = useCallback(
        (next: AuthoredFlow) => setNodesOrder(nodeOrderFromFlow(next) as TemplateTestCaseNodeOrderMap),
        [],
      )
      const invocationController = useFlowInvocationController({
        flow,
        definitions: [definition],
        publish,
        nodeKind: 'template-test-case',
      })
      const invocationResources = useStepInvocationResources(resources)
      return (
        <>
          <TemplateTestCaseFlow
            initialNodesOrder={nodesOrder}
            stepDefinitions={[definition]}
            resources={invocationResources}
            onNodeOrderChange={next => setNodesOrder(next as TemplateTestCaseNodeOrderMap)}
            invocationController={invocationController}
          />
          <output aria-label="Template node count">{Object.keys(nodesOrder).length}</output>
          <output aria-label="Template nodes">{JSON.stringify(nodesOrder)}</output>
        </>
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
    fireEvent.change(screen.getByLabelText('width'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(screen.getByText('width is required.')).toBeVisible()
    expect(screen.getByLabelText('Template node count')).toHaveTextContent('0')

    fireEvent.change(screen.getByLabelText('width'), { target: { value: '1440' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    const node = Object.values(JSON.parse(screen.getByLabelText('Template nodes').textContent ?? '{}'))[0] as {
      parameters: Array<Record<string, unknown>>
    }
    expect(node.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'width', defaultValue: '1440' })]),
    )
    expect(node.parameters[0]).not.toHaveProperty('value')
  })
})
