import type { PlanArtifact, ReviewArtifact } from '@/lib/plan-contract'

export type PlanGraphNode = PlanArtifact['tasks'][number] & {
  status: 'ready' | 'blocked'
}

export type PlanGraphEdge = PlanArtifact['edges'][number] & {
  id: string
}

export type RevisionTaskDiff = {
  added: PlanArtifact['tasks']
  removed: PlanArtifact['tasks']
  changed: Array<{
    before: PlanArtifact['tasks'][number]
    after: PlanArtifact['tasks'][number]
  }>
}

export type GraphReadiness = {
  ready: boolean
  listFallback: boolean
  staleWorker: boolean
  retryAllowed: boolean
}

export function evaluateGraphReadiness(
  events: Array<{ type: string; createdAt: Date }>,
  now = new Date(),
  timeoutMs = 30_000,
): GraphReadiness {
  const ready = events.some(event => event.type === 'plan_review_ready')
  const failures = events.filter(event => event.type === 'plan_graph_failed')
  const lastStarted = events.findLast(event => event.type === 'plan_graph_processing_started')
  const lastFinished = events.findLast(event => ['plan_review_ready', 'plan_graph_failed'].includes(event.type))
  const staleWorker = Boolean(
    lastStarted &&
      (!lastFinished || lastFinished.createdAt < lastStarted.createdAt) &&
      now.getTime() - lastStarted.createdAt.getTime() >= timeoutMs,
  )
  return {
    ready: ready || failures.length >= 2,
    listFallback: failures.length >= 2,
    staleWorker,
    retryAllowed: !ready && (failures.length > 0 || staleWorker),
  }
}

export function derivePlanGraph(plan: PlanArtifact): { nodes: PlanGraphNode[]; edges: PlanGraphEdge[] } {
  const blockedIds = new Set(plan.edges.filter(edge => edge.type === 'blocks').map(edge => edge.to))
  return {
    nodes: plan.tasks.map(task => ({ ...task, status: blockedIds.has(task.id) ? 'blocked' : 'ready' })),
    edges: plan.edges.map((edge, index) => ({ ...edge, id: `${edge.from}-${edge.type}-${edge.to}-${index}` })),
  }
}

export function getThreadStatus(thread: ReviewArtifact['threads'][number]): string {
  return thread.events.at(-1)?.action ?? 'created'
}

export function isThreadOpen(thread: ReviewArtifact['threads'][number]): boolean {
  return !['resolved', 'dismissed'].includes(getThreadStatus(thread))
}

export function getBlockingThreads(review: ReviewArtifact | undefined): ReviewArtifact['threads'] {
  return review?.threads.filter(thread => thread.blocking && isThreadOpen(thread)) ?? []
}

export function getOrphanedThreads(plan: PlanArtifact, review: ReviewArtifact | undefined): ReviewArtifact['threads'] {
  const taskIds = new Set(plan.tasks.map(task => task.id))
  return (
    review?.threads.filter(
      thread => thread.target.type === 'task' && !taskIds.has(thread.target.taskId) && isThreadOpen(thread),
    ) ?? []
  )
}

export function diffPlanTasks(before: PlanArtifact, after: PlanArtifact): RevisionTaskDiff {
  const beforeById = new Map(before.tasks.map(task => [task.id, task]))
  const afterById = new Map(after.tasks.map(task => [task.id, task]))
  return {
    added: after.tasks.filter(task => !beforeById.has(task.id)),
    removed: before.tasks.filter(task => !afterById.has(task.id)),
    changed: after.tasks.flatMap(task => {
      const previous = beforeById.get(task.id)
      return previous && JSON.stringify(previous) !== JSON.stringify(task) ? [{ before: previous, after: task }] : []
    }),
  }
}

export function hasSuspiciousReplacement(diff: RevisionTaskDiff): boolean {
  return diff.added.some(added =>
    diff.removed.some(removed => added.title.trim().toLowerCase() === removed.title.trim().toLowerCase()),
  )
}

export function canApprovePlan(input: {
  displayedRevision: number
  currentRevision: number
  conflicted: boolean
  representationReady: boolean
  blockingThreads: number
  orphanedThreads: number
  suspiciousReplacementConfirmed: boolean
  suspiciousReplacement: boolean
}): { allowed: boolean; reason?: string } {
  if (input.displayedRevision !== input.currentRevision)
    return { allowed: false, reason: 'The displayed revision is stale.' }
  if (input.conflicted) return { allowed: false, reason: 'Resolve artifact conflicts before approval.' }
  if (!input.representationReady) return { allowed: false, reason: 'The plan review representation is not ready.' }
  if (input.blockingThreads > 0) return { allowed: false, reason: 'Resolve all blocking remarks before approval.' }
  if (input.orphanedThreads > 0) return { allowed: false, reason: 'Retarget or resolve removed-node remarks.' }
  if (input.suspiciousReplacement && !input.suspiciousReplacementConfirmed) {
    return { allowed: false, reason: 'Confirm the suspicious node replacement before approval.' }
  }
  return { allowed: true }
}
