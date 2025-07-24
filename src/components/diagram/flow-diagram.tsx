"use client";

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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useState, useEffect, useMemo, memo, useRef } from "react";
import { Button } from "@/components/ui/button";
import ButtonEdge from "./button-edge";
import { Plus } from "lucide-react";
import OptionsHeaderNode from "./options-header-node";
import NodeForm from "./node-form";
import { NodeData } from "@/constants/form-opts/diagram/node-form";
import {
  NodeOrderMap,
  TemplateTestCaseNodeData,
  TemplateTestCaseNodeOrderMap,
} from "@/types/diagram/diagram";
import {
  Locator,
  TemplateStep,
  TemplateStepParameter,
  StepParameterType,
} from "@prisma/client";

const edgeTypes = {
  buttonEdge: ButtonEdge,
};

const FlowDiagram = ({
  nodeOrder,
  templateStepParams,
  templateSteps,
  locators,
  onNodeOrderChange,
  defaultValueInput = false,
}: {
  nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap;
  templateStepParams: TemplateStepParameter[];
  templateSteps: TemplateStep[];
  locators: Locator[];
  defaultValueInput?: boolean;
  onNodeOrderChange: (
    nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap
  ) => void;
}) => {
  const handleEditNodeRef = useRef<(nodeId: string) => void>(() => {});

  const generateInitialNodesAndEdges = useCallback(
    (nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap) => {
      const nodes: Node[] = [];
      const edges: Edge[] = [];

      // Sort entries by order value
      const sortedEntries = Object.entries(nodeOrder).sort(
        ([, nodeDataA], [, nodeDataB]) => nodeDataA.order - nodeDataB.order
      );

      // Create nodes
      sortedEntries.forEach(([id, nodeData], index) => {
        const baseNodeData = {
          label: nodeData.label,
          gherkinStep: nodeData.gherkinStep ?? "",
          isFirstNode: nodeData.isFirstNode ?? false,
          icon: nodeData.icon ?? "",
          parameters: (nodeData.parameters ?? []).map(
            (
              p:
                | NodeData["parameters"][number]
                | TemplateTestCaseNodeData["parameters"][number]
            ) => ({
              name: p.name,
              value: "value" in p ? p.value : p.defaultValue,
              type: p.type ?? StepParameterType.STRING,
              order: p.order,
            })
          ),
          templateStepId: nodeData.templateStepId ?? "",
        };

        // Skip isolated nodes (order === -1)
        if (nodeData.order === -1) {
          nodes.push({
            id,
            data: baseNodeData,
            position: { x: 0, y: index * 100 }, // Stack isolated nodes vertically
            type: "optionsHeaderNode",
          });
          return;
        }

        nodes.push({
          id,
          data: baseNodeData,
          position: { x: nodeData.order * 500, y: 0 }, // Space nodes horizontally based on order
          type: "optionsHeaderNode",
        });

        // Create edges between consecutive nodes
        if (index < sortedEntries.length - 1) {
          const nextEntry = sortedEntries[index + 1];
          // Only create edge if both nodes have valid orders (not -1)
          if (
            nodeData.order !== -1 &&
            nextEntry[1].order !== -1 &&
            nodeData.order === nextEntry[1].order - 1
          ) {
            edges.push({
              id: `${id}-${nextEntry[0]}`,
              source: id,
              target: nextEntry[0],
              type: "buttonEdge",
            });
          }
        }
      });

      return { nodes, edges };
    },
    []
  );

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => generateInitialNodesAndEdges(nodeOrder),
    [nodeOrder, generateInitialNodesAndEdges]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [showAddNodeDialog, setShowAddNodeDialog] = useState(false);
  const [showEditNodeDialog, setShowEditNodeDialog] = useState(false);
  const [editNodeId, setEditNodeId] = useState<string | null>(null);
  const [editNodeData, setEditNodeData] = useState<NodeData | null>(null);

  const handleEditNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((node) => node.id === nodeId);
      setEditNodeData({
        ...(node?.data as NodeData),
        gherkinStep: (node?.data as NodeData)?.gherkinStep ?? "",
        parameters: ((node?.data as NodeData)?.parameters ?? []).map((p) => ({
          name: p.name,
          value: p.value,
          type: p.type ?? StepParameterType.STRING,
          order: p.order,
        })),
        templateStepId: (node?.data as NodeData)?.templateStepId ?? "",
      });
      setEditNodeId(nodeId);
      setShowEditNodeDialog(true);
    },
    [nodes]
  );

  // Update the ref whenever handleEditNode changes
  useEffect(() => {
    handleEditNodeRef.current = handleEditNode;
  }, [handleEditNode]);

  const addNode = useCallback(
    (formData: NodeData) => {
      // Lookup the icon from the template step
      const templateStep = templateSteps.find(
        (ts) => ts.id === formData.templateStepId
      );
      const icon = templateStep?.icon ?? "MOUSE";
      const newNode: Node = {
        id: crypto.randomUUID(),
        data: {
          ...formData,
          icon, // Add icon here
          isFirstNode: nodes.length === 0,
        },
        position: { x: 0, y: 0 },
        type: "optionsHeaderNode",
      };
      setNodes((nds) => nds.concat(newNode));
      setShowAddNodeDialog(false);
    },
    [setNodes, setShowAddNodeDialog, nodes, templateSteps]
  );

  const handleEditNodeSubmit = useCallback(
    (formData: NodeData) => {
      if (!editNodeId) return;
      const templateStep = templateSteps.find(
        (ts) => ts.id === formData.templateStepId
      );
      const icon = templateStep?.icon ?? "MOUSE";
      setNodes((nds) =>
        nds.map((node) =>
          node.id === editNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...formData,
                  icon, // Update icon here
                },
              }
            : node
        )
      );
      setShowEditNodeDialog(false);
    },
    [editNodeId, setNodes, setShowEditNodeDialog, templateSteps]
  );

  const determineNodeOrders = useCallback((nodes: Node[], edges: Edge[]) => {
    // Create adjacency list
    const graph: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};
    const hasConnections: Record<string, boolean> = {};
    const nodeIds = new Set(nodes.map((node) => node.id));

    // Initialize graph, inDegree, and hasConnections
    nodes.forEach((node) => {
      graph[node.id] = [];
      inDegree[node.id] = 0;
      hasConnections[node.id] = false;
    });

    // Build graph - only include edges where both source and target nodes exist
    edges.forEach((edge) => {
      if (
        edge.source &&
        edge.target &&
        nodeIds.has(edge.source) &&
        nodeIds.has(edge.target)
      ) {
        graph[edge.source].push(edge.target);
        inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
        hasConnections[edge.source] = true;
        hasConnections[edge.target] = true;
      }
    });

    // Find nodes with no incoming edges
    const queue = nodes
      .map((node) => node.id)
      .filter((id) => inDegree[id] === 0 && hasConnections[id]);

    const orders: NodeOrderMap = {};
    let orderNum = 1;

    // First mark all isolated nodes with -1
    nodes.forEach((node) => {
      if (!hasConnections[node.id]) {
        orders[node.id] = {
          order: -1,
          label: node.data.label as string,
          gherkinStep: (node.data.gherkinStep as string) ?? "",
          isFirstNode: (node.data.isFirstNode as boolean) ?? false,
          icon: (node.data.icon as string) ?? "",
          parameters: (
            (node.data.parameters as NodeData["parameters"]) ?? []
          ).map((p) => ({
            name: p.name,
            value: p.value,
            type: p.type ?? StepParameterType.STRING,
            order: p.order,
          })),
          templateStepId: (node.data.templateStepId as string) ?? "",
        };
      }
    });

    // Process queue
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentNode = nodes.find((node) => node.id === currentId)!;
      orders[currentId] = {
        order: orderNum++,
        label: currentNode.data.label as string,
        gherkinStep: (currentNode.data.gherkinStep as string) ?? "",
        isFirstNode: (currentNode.data.isFirstNode as boolean) ?? false,
        icon: (currentNode.data.icon as string) ?? "",
        parameters: (
          (currentNode.data.parameters as NodeData["parameters"]) ?? []
        ).map((p) => ({
          name: p.name,
          value: p.value,
          type: p.type ?? StepParameterType.STRING,
          order: p.order,
        })),
        templateStepId: (currentNode.data.templateStepId as string) ?? "",
      };

      // Process neighbors
      graph[currentId].forEach((neighborId) => {
        inDegree[neighborId]--;
        if (inDegree[neighborId] === 0) {
          queue.push(neighborId);
        }
      });
    }

    // Handle any remaining nodes (cycles)
    nodes.forEach((node) => {
      if (!orders[node.id]) {
        orders[node.id] = {
          order: orderNum++,
          label: node.data.label as string,
          gherkinStep: (node.data.gherkinStep as string) ?? "",
          isFirstNode: (node.data.isFirstNode as boolean) ?? false,
          icon: (node.data.icon as string) ?? "",
          parameters: (
            (node.data.parameters as NodeData["parameters"]) ?? []
          ).map((p) => ({
            name: p.name,
            value: p.value,
            type: p.type ?? StepParameterType.STRING,
            order: p.order,
          })),
          templateStepId: (node.data.templateStepId as string) ?? "",
        };
      }
    });

    return orders;
  }, []);

  useEffect(() => {
    const orders = determineNodeOrders(nodes, edges);
    onNodeOrderChange(orders);
  }, [nodes, edges, determineNodeOrders, onNodeOrderChange]);

  // Clean up orphaned edges when nodes are deleted
  useEffect(() => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    const orphanedEdges = edges.filter(
      (edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target)
    );

    if (orphanedEdges.length > 0) {
      setEdges((prevEdges) =>
        prevEdges.filter(
          (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
        )
      );
    }
  }, [nodes, edges, setEdges]);

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      // Check if source node already has an outgoing connection
      const hasSourceConnection = edges.some(
        (edge) => edge.source === connection.source
      );

      // Check if target node already has an incoming connection
      const hasTargetConnection = edges.some(
        (edge) => edge.target === connection.target
      );

      // Allow reconnection if we're connecting the same nodes
      const isReconnecting = edges.some(
        (edge) =>
          edge.source === connection.source && edge.target === connection.target
      );

      return isReconnecting || (!hasSourceConnection && !hasTargetConnection);
    },
    [edges]
  );

  const onConnect: OnConnect = useCallback(
    (params) => {
      if (isValidConnection(params)) {
        setEdges((eds) => addEdge(params, eds));
      }
    },
    [setEdges, isValidConnection]
  );

  const memoizedTemplateSteps = useMemo(() => templateSteps, [templateSteps]);
  const memoizedTemplateStepParams = useMemo(
    () => templateStepParams,
    [templateStepParams]
  );
  const memoizedLocators = useMemo(() => locators, [locators]);

  // Memoize nodeTypes to prevent recreation
  const nodeTypes = useMemo(
    () => ({
      optionsHeaderNode: (props: NodeProps) => (
        <OptionsHeaderNode
          {...props}
          onEdit={(nodeId) => handleEditNodeRef.current(nodeId)}
        />
      ),
    }),
    [] // Empty dependency array - now stable since we use ref
  );

  return (
    <>
      <div className="w-full h-[400px]">
        <div className="mb-8">
          <Button onClick={() => setShowAddNodeDialog(true)}>
            <span className="flex items-center">
              <Plus className="w-4 h-4 mr-2" />
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
            type: "buttonEdge",
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
            label: "",
            gherkinStep: "",
            templateStepId: "",
            parameters: [],
          }}
          templateSteps={memoizedTemplateSteps}
          templateStepParams={memoizedTemplateStepParams}
          showAddNodeDialog={showAddNodeDialog}
          setShowAddNodeDialog={setShowAddNodeDialog}
          locators={memoizedLocators}
          defaultValueInput={defaultValueInput}
        />
      )}

      {showEditNodeDialog && (
        <NodeForm
          onSubmitAction={handleEditNodeSubmit}
          initialValues={{
            label: editNodeData?.label ?? "",
            gherkinStep: editNodeData?.gherkinStep ?? "",
            templateStepId: editNodeData?.templateStepId ?? "",
            parameters: editNodeData?.parameters ?? [],
          }}
          templateSteps={memoizedTemplateSteps}
          templateStepParams={memoizedTemplateStepParams}
          showAddNodeDialog={showEditNodeDialog}
          setShowAddNodeDialog={setShowEditNodeDialog}
          locators={memoizedLocators}
          defaultValueInput={defaultValueInput}
        />
      )}
    </>
  );
};

export default memo(FlowDiagram);
