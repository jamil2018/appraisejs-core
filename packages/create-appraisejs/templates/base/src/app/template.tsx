'use client'

import { LazyMotion, domAnimation, useReducedMotion } from 'motion/react'
import * as motion from 'motion/react-m'
import { usePathname } from 'next/navigation'

export type PageTransitionVariant = 'fade' | 'slide'

export function getPageTransitionVariant(pathname: string): PageTransitionVariant {
  const segments = pathname.split('/').filter(Boolean)

  return segments.includes('create') || segments.includes('create-from-template') || segments.includes('modify')
    ? 'slide'
    : 'fade'
}

export default function Template({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname()
  const shouldReduceMotion = useReducedMotion()
  const variant = getPageTransitionVariant(pathname)
  const initial = variant === 'slide' ? { x: 28 } : { opacity: 0 }
  const duration = variant === 'slide' ? 0.4 : 0.32

  return (
    <LazyMotion features={domAnimation} strict>
      <motion.div
        key={pathname}
        data-page-transition
        data-page-transition-variant={variant}
        initial={shouldReduceMotion ? false : initial}
        animate={variant === 'slide' ? { x: 0 } : { opacity: 1 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration, ease: [0.22, 1, 0.36, 1] }}
        style={shouldReduceMotion ? undefined : { willChange: 'opacity, transform' }}
      >
        {children}
      </motion.div>
    </LazyMotion>
  )
}
