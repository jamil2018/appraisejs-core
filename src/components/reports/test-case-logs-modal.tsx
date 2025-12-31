'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StepStatus, StepKeyword, ReportScenario, ReportStep, ReportHook } from '@prisma/client'
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'

type ReportScenarioWithDetails = ReportScenario & {
  tags: Array<{ tagName: string }>
  steps: ReportStep[]
  hooks: ReportHook[]
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

const formatKeyword = (keyword: StepKeyword) => {
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
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{reportScenario.name}</DialogTitle>
          {reportScenario.description && (
            <DialogDescription className="text-sm text-muted-foreground">
              {reportScenario.description}
            </DialogDescription>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6">
            {/* Tags */}
            {reportScenario.tags.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Tags</h4>
                <div className="flex flex-wrap gap-1">
                  {reportScenario.tags.map((tag, index) => (
                    <Badge key={index} variant="outline">
                      {tag.tagName}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Steps */}
            <div>
              <h4 className="text-sm font-medium mb-3">Steps</h4>
              <div className="space-y-3">
                {sortedSteps.length > 0 ? (
                  sortedSteps.map((step, index) => (
                    <div key={step.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-muted-foreground">
                              {formatKeyword(step.keyword)}
                            </span>
                            <span className="text-sm">{step.name}</span>
                          </div>
                          {step.matchLocation && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {step.matchLocation}
                            </div>
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
                            <div className="bg-red-950/20 border border-red-800/50 rounded p-2">
                              <div className="flex items-center gap-2 mb-1">
                                <AlertCircle className="h-4 w-4 text-red-500" />
                                <span className="text-sm font-medium text-red-400">Error Message</span>
                              </div>
                              <pre className="text-xs text-red-300 whitespace-pre-wrap break-words">
                                {step.errorMessage}
                              </pre>
                            </div>
                          )}
                          {step.errorTrace && (
                            <div className="bg-red-950/20 border border-red-800/50 rounded p-2">
                              <div className="flex items-center gap-2 mb-1">
                                <AlertCircle className="h-4 w-4 text-red-500" />
                                <span className="text-sm font-medium text-red-400">Error Trace</span>
                              </div>
                              <pre className="text-xs text-red-300 whitespace-pre-wrap break-words font-mono">
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
                <h4 className="text-sm font-medium mb-3">Hooks</h4>
                <div className="space-y-3">
                  {reportScenario.hooks.map((hook, index) => (
                    <div key={hook.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
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
                            <div className="bg-red-950/20 border border-red-800/50 rounded p-2">
                              <div className="flex items-center gap-2 mb-1">
                                <AlertCircle className="h-4 w-4 text-red-500" />
                                <span className="text-sm font-medium text-red-400">Error Message</span>
                              </div>
                              <pre className="text-xs text-red-300 whitespace-pre-wrap break-words">
                                {hook.errorMessage}
                              </pre>
                            </div>
                          )}
                          {hook.errorTrace && (
                            <div className="bg-red-950/20 border border-red-800/50 rounded p-2">
                              <div className="flex items-center gap-2 mb-1">
                                <AlertCircle className="h-4 w-4 text-red-500" />
                                <span className="text-sm font-medium text-red-400">Error Trace</span>
                              </div>
                              <pre className="text-xs text-red-300 whitespace-pre-wrap break-words font-mono">
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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

