import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

const STAGE_WIDTH = 340
const STAGE_HEIGHT = 150

type Graph = PlanReviewDetail['graph']

export type SemanticTask = Graph['nodes'][number] & {
  step: number
  stage: number
  position: { x: number; y: number }
}

export type SemanticEdge = Graph['edges'][number] & {
  source: string
  target: string
}

function buildDependencyMaps(graph: Graph, canonicalIndex: Map<string, number>) {
  const prerequisites = new Map(graph.nodes.map(task => [task.id, new Set<string>()]))
  const dependents = new Map(graph.nodes.map(task => [task.id, new Set<string>()]))

  for (const edge of graph.edges) {
    if (edge.type !== 'depends-on' || !canonicalIndex.has(edge.from) || !canonicalIndex.has(edge.to)) continue
    prerequisites.get(edge.from)?.add(edge.to)
    dependents.get(edge.to)?.add(edge.from)
  }

  return { prerequisites, dependents }
}

export function projectPlanFlow(graph: Graph): {
  tasks: SemanticTask[]
  edges: SemanticEdge[]
  hasCycle: boolean
} {
  const canonicalIndex = new Map(graph.nodes.map((task, index) => [task.id, index]))
  const { prerequisites, dependents } = buildDependencyMaps(graph, canonicalIndex)
  const indegree = new Map([...prerequisites].map(([id, values]) => [id, values.size]))
  const stageById = new Map(graph.nodes.map(task => [task.id, 0]))
  const ready = graph.nodes.filter(task => indegree.get(task.id) === 0).map(task => task.id)
  const orderedIds: string[] = []

  while (ready.length > 0) {
    ready.sort((left, right) => canonicalIndex.get(left)! - canonicalIndex.get(right)!)
    const taskId = ready.shift()!
    orderedIds.push(taskId)

    for (const dependentId of dependents.get(taskId) ?? []) {
      stageById.set(dependentId, Math.max(stageById.get(dependentId) ?? 0, (stageById.get(taskId) ?? 0) + 1))
      const nextIndegree = (indegree.get(dependentId) ?? 0) - 1
      indegree.set(dependentId, nextIndegree)
      if (nextIndegree === 0) ready.push(dependentId)
    }
  }

  const orderedIdSet = new Set(orderedIds)
  const unresolvedIds = graph.nodes.map(task => task.id).filter(id => !orderedIdSet.has(id))
  const hasCycle = unresolvedIds.length > 0
  if (hasCycle) {
    const fallbackStage = Math.max(0, ...stageById.values()) + 1
    for (const taskId of unresolvedIds) {
      stageById.set(taskId, fallbackStage)
      orderedIds.push(taskId)
    }
  }

  const stageOffsets = new Map<number, number>()
  const taskById = new Map(graph.nodes.map(task => [task.id, task]))
  const tasks = orderedIds.map((taskId, index) => {
    const task = taskById.get(taskId)!
    const stage = stageById.get(taskId) ?? 0
    const stageOffset = stageOffsets.get(stage) ?? 0
    stageOffsets.set(stage, stageOffset + 1)
    return {
      ...task,
      step: index + 1,
      stage,
      position: { x: stage * STAGE_WIDTH, y: stageOffset * STAGE_HEIGHT },
    }
  })

  const edges = graph.edges.map(edge => ({
    ...edge,
    source: edge.type === 'depends-on' ? edge.to : edge.from,
    target: edge.type === 'depends-on' ? edge.from : edge.to,
  }))

  return { tasks, edges, hasCycle }
}
