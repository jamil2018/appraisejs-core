'use client'

import { TestRunStatus, Report } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { FileText } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import Link from 'next/link'

interface ViewReportButtonProps {
  testRunStatus: TestRunStatus
  reports: Report[]
  className?: string
}

export function ViewReportButton({ testRunStatus, reports, className }: ViewReportButtonProps) {
  // Button should only be visible when test run is completed/cancelled AND a report exists
  const shouldShow =
    (testRunStatus === TestRunStatus.COMPLETED || testRunStatus === TestRunStatus.CANCELLED) &&
    reports.length > 0

  if (!shouldShow) {
    return null
  }

  const reportId = reports[0].id

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <Link href={`/reports/${reportId}`}>
          <Button variant="outline" size="sm" className={className}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, delay: 0.1 }}
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              View Report
            </motion.div>
          </Button>
        </Link>
      </motion.div>
    </AnimatePresence>
  )
}

