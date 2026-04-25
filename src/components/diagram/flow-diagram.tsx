'use client'

import {
  addEdge,
  Background,
  ConnectionMode,
  Controls,
  Edge,
  Node,
  NodeProps,
  OnConnect,
  ReactFlow,
  useEdgesState,
  useNodesState,
  Connection,
  DefaultEdgeOptions,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useState, useEffect, useMemo, memo } from 'react'
import { Button } from '@/components/ui/button'
import ButtonEdge from './button-edge'
import { Plus } from 'lucide-react'
import OptionsHeaderNode from './options-header-node'
import { AddNodePromptNode, type AddNodePromptFlowNode } from './add-node-prompt-node'
import NodeForm from './node-form'
import { NodeData } from '@/constants/form-opts/diagram/node-form'
import { NodeOrderMap, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'
import { Locator, TemplateStep, TemplateStepParameter, LocatorGroup } from '@prisma/client'
import {
  buildNodeFormData,
  createAddNodePromptNode,
  createEditableNodeData,
  determineNodeOrders,
  determineStartNodeIds,
  generateInitialNodesAndEdges,
  isAddNodePromptNode,
  isValidDiagramConnection,
  removeOrphanedEdges,
} from './flow-diagram-helpers'

const edgeTypes = {
  buttonEdge: ButtonEdge,
}

const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'buttonEdge',
}

const flowDiagramProOptions = { hideAttribution: true }

const flowDiagramHandlersRef = {
  current: {
    onEditNode: (_nodeId: string) => {},
    onOpenAddNode: () => {},
  },
}

function OptionsHeaderNodeWrapper(props: NodeProps) {
  return <OptionsHeaderNode {...props} onEdit={nodeId => flowDiagramHandlersRef.current.onEditNode(nodeId)} />
}

function AddNodePromptNodeWrapper(props: NodeProps) {
  return (
    <AddNodePromptNode
      {...(props as NodeProps<AddNodePromptFlowNode>)}
      onOpenAddNode={() => flowDiagramHandlersRef.current.onOpenAddNode()}
    />
  )
}

const nodeTypes = {
  optionsHeaderNode: OptionsHeaderNodeWrapper,
  addNodePromptNode: AddNodePromptNodeWrapper,
}

type FlowDiagramProps = {
  nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap
  templateStepParams: TemplateStepParameter[]
  templateSteps: TemplateStep[]
  locators: Locator[]
  locatorGroups: LocatorGroup[]
  defaultValueInput?: boolean
  onNodeOrderChange: (nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap) => void
}

const FlowDiagram = ({
  nodeOrder,
  templateStepParams,
  templateSteps,
  locators,
  locatorGroups,
  onNodeOrderChange,
  defaultValueInput = false,
}: FlowDiagramProps) => {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => generateInitialNodesAndEdges(nodeOrder, templateStepParams, defaultValueInput),
    [defaultValueInput, nodeOrder, templateStepParams],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [showAddNodeDialog, setShowAddNodeDialog] = useState(false)
  const [showEditNodeDialog, setShowEditNodeDialog] = useState(false)
  const [editNodeId, setEditNodeId] = useState<string | null>(null)
  const [editNodeData, setEditNodeData] = useState<NodeData | null>(null)

  const handleEditNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find(node => node.id === nodeId)
      const editableNodeData = createEditableNodeData(node)
      if (!editableNodeData) {
        return
      }

      setEditNodeData(editableNodeData)
      setEditNodeId(nodeId)
      setShowEditNodeDialog(true)
    },
    [nodes],
  )

  useEffect(() => {
    flowDiagramHandlersRef.current.onEditNode = handleEditNode
    flowDiagramHandlersRef.current.onOpenAddNode = () => setShowAddNodeDialog(true)
  }, [handleEditNode])

  const addNode = useCallback(
    (formData: NodeData) => {
      const realCount = nodes.filter(n => !isAddNodePromptNode(n)).length
      const newNode: Node = {
        id: crypto.randomUUID(),
        data: buildNodeFormData(formData, templateSteps, templateStepParams, defaultValueInput, realCount === 0),
        position: { x: 0, y: 0 },
        type: 'optionsHeaderNode',
      }
      setNodes(nds => nds.filter(n => !isAddNodePromptNode(n)).concat(newNode))
      setShowAddNodeDialog(false)
    },
    [setNodes, nodes, templateSteps, templateStepParams, defaultValueInput],
  )

  const handleEditNodeSubmit = useCallback(
    (formData: NodeData) => {
      if (!editNodeId) return
      const nextNodeData = buildNodeFormData(formData, templateSteps, templateStepParams, defaultValueInput, false)

      setNodes(nds =>
        nds.map(node =>
          node.id === editNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...nextNodeData,
                },
              }
            : node,
        ),
      )
      setShowEditNodeDialog(false)
    },
    [editNodeId, setNodes, templateSteps, templateStepParams, defaultValueInput],
  )

  useEffect(() => {
    const orders = determineNodeOrders(nodes, edges)
    onNodeOrderChange(orders)
  }, [nodes, edges, onNodeOrderChange])

  useEffect(() => {
    const hasRealNode = nodes.some(n => !isAddNodePromptNode(n))
    if (hasRealNode) {
      return
    }
    const hasPrompt = nodes.some(n => isAddNodePromptNode(n))
    if (hasPrompt) {
      return
    }
    setNodes([createAddNodePromptNode()])
  }, [nodes, setNodes])

  useEffect(() => {
    const nextEdges = removeOrphanedEdges(nodes, edges)

    if (nextEdges.length !== edges.length) {
      setEdges(nextEdges)
    }
  }, [nodes, edges, setEdges])

  useEffect(() => {
    const nextEdges = removeOrphanedEdges(nodes, edges)
    const startNodeIds = determineStartNodeIds(nodes, nextEdges)

    setNodes(currentNodes => {
      let hasUpdates = false
      const updatedNodes = currentNodes.map(node => {
        if (isAddNodePromptNode(node)) {
          return node
        }

        const isFirstNode = startNodeIds.has(node.id)
        const currentIsFirstNode = Boolean((node.data as { isFirstNode?: boolean }).isFirstNode)
        if (currentIsFirstNode === isFirstNode) {
          return node
        }

        hasUpdates = true
        return {
          ...node,
          data: {
            ...node.data,
            isFirstNode,
          },
        }
      })

      return hasUpdates ? updatedNodes : currentNodes
    })
  }, [nodes, edges, setNodes])

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => isValidDiagramConnection(edges, connection),
    [edges],
  )

  const onConnect: OnConnect = useCallback(
    params => {
      if (isValidConnection(params)) {
        setEdges(eds => addEdge(params, eds))
      }
    },
    [setEdges, isValidConnection],
  )

  const memoizedTemplateSteps = useMemo(() => templateSteps, [templateSteps])
  const memoizedTemplateStepParams = useMemo(() => templateStepParams, [templateStepParams])
  const memoizedLocators = useMemo(() => locators, [locators])

  const openAddNodeDialog = useCallback(() => setShowAddNodeDialog(true), [])

  return (
    <>
      <div className="flex h-full min-h-0 w-full flex-col">
        <div className="mb-8 shrink-0">
          <Button type="button" onClick={openAddNodeDialog}>
            <span className="flex items-center">
              <Plus className="mr-2 h-4 w-4" />
              Add Node
            </span>
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <ReactFlow
            className="h-full w-full"
            nodes={nodes}
            onNodesChange={onNodesChange}
            edges={edges}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            colorMode="dark"
            connectionMode={ConnectionMode.Loose}
            edgeTypes={edgeTypes}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            connectOnClick={false}
            isValidConnection={isValidConnection}
            proOptions={flowDiagramProOptions}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      </div>

      <NodeForm
        onSubmitAction={addNode}
        mode="add"
        initialValues={{
          label: '',
          gherkinStep: '',
          templateStepId: '',
          parameters: [],
        }}
        templateSteps={memoizedTemplateSteps}
        templateStepParams={memoizedTemplateStepParams}
        showAddNodeDialog={showAddNodeDialog}
        setShowAddNodeDialog={setShowAddNodeDialog}
        locators={memoizedLocators}
        defaultValueInput={defaultValueInput}
        locatorGroups={locatorGroups}
      />

      {editNodeData && (
        <NodeForm
          onSubmitAction={handleEditNodeSubmit}
          mode="edit"
          initialValues={{
            label: editNodeData?.label ?? '',
            gherkinStep: editNodeData?.gherkinStep ?? '',
            templateStepId: editNodeData?.templateStepId ?? '',
            parameters: editNodeData?.parameters ?? [],
          }}
          templateSteps={memoizedTemplateSteps}
          templateStepParams={memoizedTemplateStepParams}
          showAddNodeDialog={showEditNodeDialog}
          setShowAddNodeDialog={setShowEditNodeDialog}
          locators={memoizedLocators}
          defaultValueInput={defaultValueInput}
          locatorGroups={locatorGroups}
        />
      )}
    </>
  )
}

export default memo(FlowDiagram)
