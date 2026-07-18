import { Bell, Bot, GitCompareArrows, History } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'
import {
  delegatedOperationReceipts,
  evidenceProvenanceTimeline,
  liveAgentActivity,
  projectLifecycleNotifications,
  revisionImpact,
} from '@/lib/plans/plan-lifecycle-insights'

export function LifecycleInsightsPanel({ detail }: { detail: PlanReviewDetail }) {
  const activity = liveAgentActivity(detail)
  const notifications = projectLifecycleNotifications(detail.events).slice(-5).reverse()
  const timeline = evidenceProvenanceTimeline(detail).slice(0, 8)
  const impact = revisionImpact(detail)
  const delegated = delegatedOperationReceipts(detail)
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card aria-labelledby="agent-activity-title">
        <CardHeader className="pb-3">
          <CardTitle id="agent-activity-title" className="flex items-center gap-2 text-base">
            <Bot className="size-4 text-primary" /> Live agent activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-1">
            <Badge>{activity.phase}</Badge> {activity.completedStages}/{activity.totalStages} lifecycle stages complete
            · {activity.waitState.replaceAll('_', ' ')}
          </div>
          <p className="text-muted-foreground">
            Latest durable operation: {activity.latestDurableOperation?.type ?? 'none'}
            {activity.latestDurableOperation ? ` at sequence ${activity.latestDurableOperation.sequence}` : ''}.
          </p>
          <p>
            {activity.nextAction.actor}: {activity.nextAction.action}
          </p>
        </CardContent>
      </Card>

      <Card aria-labelledby="notifications-title">
        <CardHeader className="pb-3">
          <CardTitle id="notifications-title" className="flex items-center gap-2 text-base">
            <Bell className="size-4 text-primary" /> Lifecycle notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {notifications.length ? (
            notifications.map(item => (
              <div key={item.eventSequence} className="bg-muted/20 rounded-md border p-2">
                <Badge variant="outline">{item.actor}</Badge> {item.message} · event {item.eventSequence}
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">No actionable lifecycle notifications yet.</p>
          )}
        </CardContent>
      </Card>

      <Card aria-labelledby="provenance-title">
        <CardHeader className="pb-3">
          <CardTitle id="provenance-title" className="flex items-center gap-2 text-base">
            <History className="size-4 text-primary" /> Evidence provenance timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {timeline.map(item => (
            <p key={`${item.kind}:${item.identity}`} className="border-l-2 pl-2">
              <span className="font-semibold">{item.kind.replaceAll('_', ' ')}</span> · {item.detail}
              <span className="block font-mono text-muted-foreground" title={item.identity}>
                {item.identity.length > 36 ? `${item.identity.slice(0, 33)}…` : item.identity}
              </span>
            </p>
          ))}
          <p className="text-muted-foreground">
            {delegated.length} content-addressed delegated operation receipt(s) attached.
          </p>
        </CardContent>
      </Card>

      <Card aria-labelledby="revision-impact-title">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle id="revision-impact-title" className="flex items-center gap-2 text-base">
              <GitCompareArrows className="size-4 text-primary" /> Revision impact
            </CardTitle>
            <Badge variant={impact.status === 'current' ? 'outline' : 'destructive'}>{impact.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <p>
            Plan revision {impact.currentPlanRevision} · validation revision {impact.validationRevision ?? 'none'}.
          </p>
          <p className="text-muted-foreground">Impacted evidence: {impact.impacted.join(', ') || 'none'}.</p>
          {impact.reasons.map(reason => (
            <p key={reason}>{reason}</p>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
