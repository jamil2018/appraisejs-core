'use client'

import type { ReactNode } from 'react'
import { TestRunStatus, type Report } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { FileText, LoaderCircle, XCircle } from 'lucide-react'
import { AnimatePresence, LazyMotion, domAnimation } from 'motion/react'
import * as motion from 'motion/react-m'
import Link from 'next/link'

interface ViewReportButtonProps {
  testRunStatus: TestRunStatus
  reports: Report[]
  className?: string
}

const fadeSlideTransition = { duration: 0.3, ease: 'easeOut' as const }
const scaleFadeTransition = { duration: 0.2, delay: 0.1 }

function AnimatedReportShell({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence mode="wait">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={fadeSlideTransition}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </LazyMotion>
  )
}

function AnimatedButtonContent({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={scaleFadeTransition}
      className="flex items-center gap-2"
    >
      {children}
    </motion.div>
  )
}

export function ViewReportButton({ testRunStatus, reports, className }: ViewReportButtonProps) {
  const shouldShowReportButton =
    (testRunStatus === TestRunStatus.COMPLETED || testRunStatus === TestRunStatus.CANCELLED) && reports.length > 0

  if (testRunStatus === TestRunStatus.CANCELLED && reports.length === 0) {
    return (
      <AnimatedReportShell>
        <Button variant="outline" size="sm" className={className} disabled>
          <AnimatedButtonContent>
            <XCircle className="size-4" />
            Report Not Available
          </AnimatedButtonContent>
        </Button>
      </AnimatedReportShell>
    )
  }

  if (testRunStatus === TestRunStatus.COMPLETED && reports.length === 0) {
    return (
      <AnimatedReportShell>
        <Button variant="outline" size="sm" className={className}>
          <AnimatedButtonContent>
            <LoaderCircle className="size-4 animate-spin" />
            Generating Report...
          </AnimatedButtonContent>
        </Button>
      </AnimatedReportShell>
    )
  }

  if (!shouldShowReportButton) {
    return null
  }

  const reportId = reports[0].id

  return (
    <AnimatedReportShell>
      <Link href={`/reports/${reportId}`}>
        <Button variant="outline" size="sm" className={className}>
          <AnimatedButtonContent>
            <FileText className="size-4" />
            View Report
          </AnimatedButtonContent>
        </Button>
      </Link>
    </AnimatedReportShell>
  )
}
