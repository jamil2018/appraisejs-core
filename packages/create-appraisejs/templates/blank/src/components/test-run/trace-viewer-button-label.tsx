'use client'

import type { ReactNode } from 'react'
import { AnimatePresence, LazyMotion, domAnimation } from 'motion/react'
import * as motion from 'motion/react-m'
import { Binoculars, ExternalLink, LoaderCircle } from 'lucide-react'

type TraceViewerButtonLabelProps = {
  labelKey: 'opening' | 'running' | 'idle'
  children: ReactNode
}

function TraceViewerButtonLabel({ labelKey, children }: TraceViewerButtonLabelProps) {
  return (
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={labelKey}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="flex w-full items-center justify-center gap-1"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </LazyMotion>
  )
}

export function TraceViewerOpeningLabel() {
  return (
    <TraceViewerButtonLabel labelKey="opening">
      <ExternalLink className="size-3 animate-pulse text-zinc-500" />
      Opening
    </TraceViewerButtonLabel>
  )
}

export function TraceViewerRunningLabel() {
  return (
    <TraceViewerButtonLabel labelKey="running">
      <LoaderCircle className="text-white-500 size-3 animate-spin" />
      Running
    </TraceViewerButtonLabel>
  )
}

export function TraceViewerIdleLabel() {
  return (
    <TraceViewerButtonLabel labelKey="idle">
      <Binoculars className="size-3 text-blue-500" />
      View Trace
    </TraceViewerButtonLabel>
  )
}
