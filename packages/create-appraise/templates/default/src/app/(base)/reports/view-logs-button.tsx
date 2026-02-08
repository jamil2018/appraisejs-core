'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'
import { TestCaseLogsModal } from '@/components/reports/test-case-logs-modal'
import { ReportScenario, StepStatus } from '@prisma/client'

/** Minimal shape for report scenario (matches Prisma include from report-view-table-columns) */
type ReportScenarioWithDetails = (ReportScenario & {
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
  }>
  hooks: Array<{
    id: string
    keyword: string
    status: StepStatus
    duration: string
    errorMessage: string | null
    errorTrace: string | null
  }>
}) | null

interface ViewLogsButtonProps {
  reportScenario: ReportScenarioWithDetails
}

export function ViewLogsButton({ reportScenario }: ViewLogsButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="flex items-center gap-2"
        onClick={() => setIsModalOpen(true)}
        disabled={!reportScenario}
      >
        <Eye className="h-4 w-4" />
        View Logs
      </Button>
      {reportScenario && (
        <TestCaseLogsModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          reportScenario={reportScenario}
        />
      )}
    </>
  )
}

