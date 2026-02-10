'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { StepStatus, StepKeyword, ReportScenario } from '@prisma/client'
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'
import { ScrollArea } from '../ui/scroll-area'

/** Minimal shape (matches include from report-view-table-columns and view-logs-button) */
type ReportScenarioWithDetails = ReportScenario & {
  tags: Array<{ tagName: string }>
  steps: Array<{
    id: string
    keyword: string
    name: string
    status: StepStatus
    duration: string
    errorMessage: string | null
    errorTrace: string | null
    order: number
    matchLocation?: string | null
  }>
  hooks: Array<{
    id: string
    keyword: string
    status: StepStatus
    duration: string
    errorMessage: string | null
    errorTrace: string | null
  }>
}

interface TestCaseLogsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reportScenario: ReportScenarioWithDetails | null
}

const stepStatusToBadge = (status: StepStatus) => {
  switch (status) {
    case StepStatus.PASSED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-1 rounded-xl border-green-700 bg-green-700/10 py-0.5 text-xs text-green-500"
        >
          <CheckCircle className="h-3 w-3" />
          PASSED
        </Badge>
      )
    case StepStatus.FAILED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-1 rounded-xl border-red-700 bg-red-700/10 py-0.5 text-xs text-red-500"
        >
          <XCircle className="h-3 w-3" />
          FAILED
        </Badge>
      )
    case StepStatus.SKIPPED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-1 rounded-xl border-gray-700 bg-gray-700/10 py-0.5 text-xs text-gray-500"
        >
          <Clock className="h-3 w-3" />
          SKIPPED
        </Badge>
      )
    default:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-1 rounded-xl border-gray-700 bg-gray-700/10 py-0.5 text-xs text-gray-500"
        >
          {status}
        </Badge>
      )
  }
}

const formatDuration = (duration: string) => {
  const durationNs = Number(duration)
  if (isNaN(durationNs)) return '-'
  const durationMs = Math.round(durationNs / 1000000)
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }
  const seconds = Math.floor(durationMs / 1000)
  const milliseconds = durationMs % 1000
  return `${seconds}.${String(milliseconds).padStart(3, '0')}s`
}

const formatKeyword = (keyword: StepKeyword | string) => {
  return keyword.charAt(0) + keyword.slice(1).toLowerCase()
}

export function TestCaseLogsModal({ open, onOpenChange, reportScenario }: TestCaseLogsModalProps) {
  if (!reportScenario) {
    return null
  }

  // Sort steps by order
  const sortedSteps = [...reportScenario.steps].sort((a, b) => a.order - b.order)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col p-0">
        <DialogHeader className="flex-shrink-0 px-6 pt-6">
          <DialogTitle className="text-xl font-semibold">{reportScenario.name}</DialogTitle>
          {reportScenario.description && (
            <DialogDescription className="text-sm text-muted-foreground">
              {reportScenario.description}
            </DialogDescription>
          )}
        </DialogHeader>

        <ScrollArea className="h-[calc(90vh-120px)] pr-4">
          <div className="px-6 pb-6">
            <div className="space-y-6">
              {/* Tags */}
              {reportScenario.tags.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Tags</h4>
                  <div className="flex flex-wrap gap-1">
                    {reportScenario.tags.map((tag, _index) => (
                      <Badge key={index} variant="outline">
                        {tag.tagName}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Steps */}
              <div>
                <h4 className="mb-3 text-sm font-medium">Steps</h4>
                <div className="space-y-3">
                  {sortedSteps.length > 0 ? (
                    sortedSteps.map((step, _index) => (
                      <div key={step.id} className="space-y-2 rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <span className="text-sm font-medium text-muted-foreground">
                                {formatKeyword(step.keyword)}
                              </span>
                              <span className="text-sm">{step.name}</span>
                            </div>
                            {step.matchLocation && (
                              <div className="mt-1 text-xs text-muted-foreground">{step.matchLocation}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {stepStatusToBadge(step.status)}
                            <span className="text-xs text-muted-foreground">{formatDuration(step.duration)}</span>
                          </div>
                        </div>
                        {step.status === StepStatus.FAILED && (
                          <div className="mt-2 space-y-2">
                            {step.errorMessage && (
                              <div className="rounded border border-red-800/50 bg-red-950/20 p-2">
                                <div className="mb-1 flex items-center gap-2">
                                  <AlertCircle className="h-4 w-4 text-red-500" />
                                  <span className="text-sm font-medium text-red-400">Error Message</span>
                                </div>
                                <pre className="whitespace-pre-wrap break-words text-xs text-red-300">
                                  {step.errorMessage}
                                </pre>
                              </div>
                            )}
                            {step.errorTrace && (
                              <div className="rounded border border-red-800/50 bg-red-950/20 p-2">
                                <div className="mb-1 flex items-center gap-2">
                                  <AlertCircle className="h-4 w-4 text-red-500" />
                                  <span className="text-sm font-medium text-red-400">Error Trace</span>
                                </div>
                                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-red-300">
                                  {step.errorTrace}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground">No steps recorded</div>
                  )}
                </div>
              </div>

              {/* Hooks */}
              {reportScenario.hooks.length > 0 && (
                <div>
                  <Separator className="my-4" />
                  <h4 className="mb-3 text-sm font-medium">Hooks</h4>
                  <div className="space-y-3">
                    {reportScenario.hooks.map((hook, _index) => (
                      <div key={hook.id} className="space-y-2 rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <span className="text-sm font-medium text-muted-foreground">
                                {formatKeyword(hook.keyword)} Hook
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {stepStatusToBadge(hook.status)}
                            <span className="text-xs text-muted-foreground">{formatDuration(hook.duration)}</span>
                          </div>
                        </div>
                        {hook.status === StepStatus.FAILED && (
                          <div className="mt-2 space-y-2">
                            {hook.errorMessage && (
                              <div className="rounded border border-red-800/50 bg-red-950/20 p-2">
                                <div className="mb-1 flex items-center gap-2">
                                  <AlertCircle className="h-4 w-4 text-red-500" />
                                  <span className="text-sm font-medium text-red-400">Error Message</span>
                                </div>
                                <pre className="whitespace-pre-wrap break-words text-xs text-red-300">
                                  {hook.errorMessage}
                                </pre>
                              </div>
                            )}
                            {hook.errorTrace && (
                              <div className="rounded border border-red-800/50 bg-red-950/20 p-2">
                                <div className="mb-1 flex items-center gap-2">
                                  <AlertCircle className="h-4 w-4 text-red-500" />
                                  <span className="text-sm font-medium text-red-400">Error Trace</span>
                                </div>
                                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-red-300">
                                  {hook.errorTrace}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
