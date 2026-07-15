/** @vitest-environment jsdom */

import { TemplateStepIcon, TemplateStepType } from '@prisma/client'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import TemplateStepLibrary from './template-step-library'
import type { TemplateStepTableRow } from './template-step-helpers'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/actions/template-step/template-step-actions', () => ({
  deleteTemplateStepAction: vi.fn(),
}))

const groups = {
  browser: { id: 'browser', name: 'Browser', description: null, createdAt: new Date(), updatedAt: new Date() },
  checks: { id: 'checks', name: 'Checks', description: null, createdAt: new Date(), updatedAt: new Date() },
}

const steps = [
  {
    id: 'visit',
    name: 'Visit page',
    description: 'Navigate to a project page.',
    signature: 'I visit {string}',
    functionDefinition: '',
    type: TemplateStepType.ACTION,
    icon: TemplateStepIcon.NAVIGATION,
    templateStepGroupId: groups.browser.id,
    templateStepGroup: groups.browser,
    parameters: [{ id: 'url', name: 'url' }],
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-02T10:00:00.000Z'),
  },
  {
    id: 'visible',
    name: 'See message',
    description: null,
    signature: 'I see {string}',
    functionDefinition: '',
    type: TemplateStepType.ASSERTION,
    icon: TemplateStepIcon.VALIDATION,
    templateStepGroupId: groups.checks.id,
    templateStepGroup: groups.checks,
    parameters: [{ id: 'message', name: 'message' }],
    createdAt: new Date('2026-07-03T10:00:00.000Z'),
    updatedAt: new Date('2026-07-04T10:00:00.000Z'),
  },
] as TemplateStepTableRow[]

describe('TemplateStepLibrary', () => {
  it('presents reusable steps as a signature-first catalog', () => {
    render(<TemplateStepLibrary steps={steps} />)

    expect(screen.getByRole('heading', { name: 'Step library' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'New template step' })).toHaveAttribute('href', '/template-steps/create')
    expect(screen.getByRole('heading', { name: 'Visit page' })).toBeVisible()
    expect(screen.getByText('I visit')).toBeVisible()
    expect(screen.getAllByText('{string}')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Browser' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Edit Visit page' })).toHaveAttribute(
      'href',
      '/template-steps/modify/visit',
    )
    expect(screen.getByRole('button', { name: 'Delete Visit page' })).toBeVisible()
    expect(screen.getAllByText('Parameters')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument()
  })

  it('filters by collection and search without presenting table semantics', async () => {
    const user = userEvent.setup()
    render(<TemplateStepLibrary steps={steps} />)

    await user.click(screen.getByRole('button', { name: 'Checks' }))
    expect(screen.queryByRole('heading', { name: 'Visit page' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'See message' })).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Search template steps' }), 'missing')
    expect(screen.getByRole('heading', { name: 'No matching template steps' })).toBeVisible()
  })

  it('paginates the scrollable catalog', async () => {
    const user = userEvent.setup()
    const manySteps = Array.from({ length: 13 }, (_, index) => ({
      ...steps[0],
      id: `step-${index + 1}`,
      name: `Step ${index + 1}`,
    }))

    render(<TemplateStepLibrary steps={manySteps} />)

    expect(screen.getAllByRole('article')).toHaveLength(12)
    expect(screen.getByText('Page 1 of 2')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Step 13' })).toBeVisible()
    expect(screen.getByText('Page 2 of 2')).toBeVisible()
  })
})
