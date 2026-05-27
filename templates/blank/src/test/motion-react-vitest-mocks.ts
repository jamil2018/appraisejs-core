import { createElement, Fragment, type HTMLAttributes, type ReactNode } from 'react'

function MotionDiv({ children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return createElement('div', props, children)
}

export const motionReactVitestMock = {
  AnimatePresence: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
  LazyMotion: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
  domAnimation: {},
  motion: {
    div: MotionDiv,
  },
}

export const motionReactMVitestMock = {
  div: MotionDiv,
}
