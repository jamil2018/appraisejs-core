import { addEdge, type Connection, type Edge, type Node, type EdgeChange, type NodeChange, type OnConnect } from '@xyflow/react'
import {
  determineStartNodeIds,
  isAddNodePromptNode,
  isEdgeWithinSameFlowBlock,
  isValidDiagramConnection,
  removeOrphanedEdges,
} from './flow-diagram-helpers'

export function filterBlockedEdgeChanges(
  changes: EdgeChange[],
  edges: Edge[],
  flowBlockMembership: Map<string, string>,
) {
  const blockedDeleteIds = changes.reduce<Set<string>>((ids, change) => {
    if (change.type !== 'remove' || !change.id) {
      return ids
    }

    const edge = edges.find(edge => edge.id === change.id)
    if (edge && isEdgeWithinSameFlowBlock(edge, flowBlockMembership)) {
      ids.add(edge.id)
    }

    return ids
  }, new Set())

  return {
    blockedDeleteIds,
    allowedChanges: changes.filter(change => change.type !== 'remove' || !change.id || !blockedDeleteIds.has(change.id)),
  }
}

export function filterBlockedNodeChanges(changes: NodeChange[], flowBlockMembership: Map<string, string>) {
  const blockedDeleteIds = new Set(
    changes.flatMap(change => (change.type === 'remove' && change.id && flowBlockMembership.has(change.id) ? [change.id] : [])),
  )

  return {
    blockedDeleteIds,
    allowedChanges: changes.filter(change => change.type !== 'remove' || !change.id || !blockedDeleteIds.has(change.id)),
  }
}

export function createOnConnectHandler(
  edges: Edge[],
  flowBlockMembership: Map<string, string>,
  setEdges: (updater: (edges: Edge[]) => Edge[]) => void,
  showTopologyBlockedToast: () => void,
): OnConnect {
  return params => {
    if (isEdgeWithinSameFlowBlock(params as Edge, flowBlockMembership)) {
      showTopologyBlockedToast()
      return
    }

    const isValid =
      !isEdgeWithinSameFlowBlock(params as Edge, flowBlockMembership) && isValidDiagramConnection(edges, params)

    if (isValid) {
      setEdges(eds => addEdge(params, eds))
    }
  }
}

export function isValidFlowDiagramConnection(
  connection: Connection | Edge,
  edges: Edge[],
  flowBlockMembership: Map<string, string>,
) {
  return (
    !isEdgeWithinSameFlowBlock(connection as Edge, flowBlockMembership) && isValidDiagramConnection(edges, connection)
  )
}

export function syncFlowNodePresentationMetadata(
  currentNodes: Node[],
  edges: Edge[],
  flowBlockMembership: Map<string, string>,
  searchHighlightedNodeId: string | null,
  isConnectionInProgress: boolean,
) {
  const nextEdges = removeOrphanedEdges(currentNodes, edges)
  const startNodeIds = determineStartNodeIds(currentNodes, nextEdges)

  let hasUpdates = false
  const updatedNodes = currentNodes.map(node => {
    if (isAddNodePromptNode(node)) {
      return node
    }

    const isFirstNode = startNodeIds.has(node.id)
    const hasOutgoingConnection = nextEdges.some(edge => edge.source === node.id)
    const currentIsFirstNode = Boolean((node.data as { isFirstNode?: boolean }).isFirstNode)
    const currentHasOutgoingConnection = Boolean((node.data as { hasOutgoingConnection?: boolean }).hasOutgoingConnection)
    const currentIsConnectionInProgress = Boolean((node.data as { isConnectionInProgress?: boolean }).isConnectionInProgress)
    const currentIsSearchHighlighted = Boolean((node.data as { isSearchHighlighted?: boolean }).isSearchHighlighted)
    const isDeleteDisabled = flowBlockMembership.has(node.id)
    const currentIsDeleteDisabled = Boolean((node.data as { isDeleteDisabled?: boolean }).isDeleteDisabled)
    const isSearchHighlighted = searchHighlightedNodeId === node.id

    if (
      currentIsFirstNode === isFirstNode &&
      currentHasOutgoingConnection === hasOutgoingConnection &&
      currentIsConnectionInProgress === isConnectionInProgress &&
      currentIsSearchHighlighted === isSearchHighlighted &&
      currentIsDeleteDisabled === isDeleteDisabled
    ) {
      return node
    }

    hasUpdates = true
    return {
      ...node,
      data: {
        ...node.data,
        isFirstNode,
        hasOutgoingConnection,
        isConnectionInProgress,
        isSearchHighlighted,
        isDeleteDisabled,
      },
    }
  })

  return hasUpdates ? updatedNodes : currentNodes
}
