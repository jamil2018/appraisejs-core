import { createElement, Fragment, type HTMLAttributes, type ReactNode } from 'react'
import { vi } from 'vitest'

type MotionDivProps = HTMLAttributes<HTMLDivElement> & {
  initial?: unknown
  animate?: unknown
  transition?: unknown
}

function MotionDiv({ children, initial, animate: _animate, transition: _transition, ...props }: MotionDivProps) {
  void _animate
  void _transition

  return createElement(
    'div',
    {
      ...props,
      'data-motion-initial': initial === false ? 'false' : undefined,
    },
    children,
  )
}

export const useReducedMotionMock = vi.fn(() => false)

export const motionReactVitestMock = {
  AnimatePresence: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
  LazyMotion: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
  domAnimation: {},
  useReducedMotion: useReducedMotionMock,
  motion: {
    div: MotionDiv,
  },
}

export const motionReactMVitestMock = {
  div: MotionDiv,
}
