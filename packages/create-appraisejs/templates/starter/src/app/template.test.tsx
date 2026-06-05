/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useReducedMotionMock } from '@/test/motion-react-vitest-mocks'
import '@/test/setup-motion-react-mocks'

import Template, { getPageTransitionVariant } from './template'

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(() => '/'),
}))

vi.mock('next/navigation', () => ({
  usePathname: usePathnameMock,
}))

describe('Template', () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue('/')
    useReducedMotionMock.mockReturnValue(false)
  })

  it('renders route content inside the transition wrapper', () => {
    render(
      <Template>
        <h1>Destination</h1>
      </Template>,
    )

    expect(screen.getByRole('heading', { name: 'Destination' })).toBeVisible()
    expect(screen.getByRole('heading').closest('[data-page-transition]')).toBeInTheDocument()
    expect(screen.getByRole('heading').closest('[data-page-transition]')).toHaveAttribute(
      'data-page-transition-variant',
      'fade',
    )
  })

  it.each([
    ['/modules/create', 'slide'],
    ['/modules/modify/module-1', 'slide'],
    ['/test-cases/create-from-template', 'slide'],
    ['/modules', 'fade'],
    ['/test-runs/run-1', 'fade'],
  ] as const)('uses the %s route transition variant', (pathname, variant) => {
    expect(getPageTransitionVariant(pathname)).toBe(variant)
  })

  it('replaces the transition wrapper when the pathname changes', () => {
    const { rerender } = render(
      <Template>
        <span>Route content</span>
      </Template>,
    )
    const initialWrapper = screen.getByText('Route content').closest('[data-page-transition]')

    usePathnameMock.mockReturnValue('/settings')
    rerender(
      <Template>
        <span>Route content</span>
      </Template>,
    )

    expect(screen.getByText('Route content').closest('[data-page-transition]')).not.toBe(initialWrapper)
  })

  it('disables the entrance animation when reduced motion is enabled', () => {
    useReducedMotionMock.mockReturnValue(true)

    render(
      <Template>
        <span>Reduced motion content</span>
      </Template>,
    )

    expect(screen.getByText('Reduced motion content').closest('[data-page-transition]')).toHaveAttribute(
      'data-motion-initial',
      'false',
    )
  })
})
