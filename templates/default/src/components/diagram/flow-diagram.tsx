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
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useState, useEffect, useMemo, memo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import ButtonEdge from './button-edge'
import { Plus } from 'lucide-react'
import OptionsHeaderNode from './options-header-node'
import NodeForm from './node-form'
import { NodeData } from '@/constants/form-opts/diagram/node-form'
import { NodeOrderMap, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'
import { Locator, TemplateStep, TemplateStepParameter, LocatorGroup } from '@prisma/client'
import {
  buildNodeFormData,
  createEditableNodeData,
  determineNodeOrders,
  generateInitialNodesAndEdges,
  isValidDiagramConnection,
  removeOrphanedEdges,
} from './flow-diagram-helpers'

const edgeTypes = {
  buttonEdge: ButtonEdge,
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
  const handleEditNodeRef = useRef<(nodeId: string) => void>(() => {})

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

  // Update the ref whenever handleEditNode changes
  useEffect(() => {
    handleEditNodeRef.current = handleEditNode
  }, [handleEditNode])

  const addNode = useCallback(
    (formData: NodeData) => {
      const newNode: Node = {
        id: crypto.randomUUID(),
        data: buildNodeFormData(formData, templateSteps, templateStepParams, defaultValueInput, nodes.length === 0),
        position: { x: 0, y: 0 },
        type: 'optionsHeaderNode',
      }
      setNodes(nds => nds.concat(newNode))
      setShowAddNodeDialog(false)
    },
    [setNodes, setShowAddNodeDialog, nodes, templateSteps, templateStepParams, defaultValueInput],
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
    [editNodeId, setNodes, setShowEditNodeDialog, templateSteps, templateStepParams, defaultValueInput],
  )

  useEffect(() => {
    const orders = determineNodeOrders(nodes, edges)
    onNodeOrderChange(orders)
  }, [nodes, edges, onNodeOrderChange])

  // Clean up orphaned edges when nodes are deleted
  useEffect(() => {
    const nextEdges = removeOrphanedEdges(nodes, edges)

    if (nextEdges.length !== edges.length) {
      setEdges(nextEdges)
    }
  }, [nodes, edges, setEdges])

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

  // Memoize nodeTypes to prevent recreation
  const nodeTypes = useMemo(
    () => ({
      optionsHeaderNode: (props: NodeProps) => (
        <OptionsHeaderNode {...props} onEdit={nodeId => handleEditNodeRef.current(nodeId)} />
      ),
    }),
    [], // Empty dependency array - now stable since we use ref
  )

  return (
    <>
      <div className="h-[400px] w-full">
        <div className="mb-8">
          <Button onClick={() => setShowAddNodeDialog(true)}>
            <span className="flex items-center">
              <Plus className="mr-2 h-4 w-4" />
              Add Node
            </span>
          </Button>
        </div>
        <ReactFlow
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
          defaultEdgeOptions={{
            type: 'buttonEdge',
          }}
          connectOnClick={false}
          isValidConnection={isValidConnection}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      {showAddNodeDialog && (
        <NodeForm
          onSubmitAction={addNode}
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
      )}

      {showEditNodeDialog && (
        <NodeForm
          onSubmitAction={handleEditNodeSubmit}
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
