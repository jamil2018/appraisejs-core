/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import EnvironmentRegistry from './environment-registry'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/actions/environments/environment-actions', () => ({
  deleteEnvironmentAction: vi.fn(),
}))

const environments = [
  {
    id: 'local',
    name: 'Local',
    baseUrl: 'http://localhost:3000',
    apiBaseUrl: 'http://localhost:3000/api',
    username: 'qa-user',
    passwordEnvironmentVariable: null,
    credentialState: 'NONE',
    legacyCredentialDetectedAt: null,
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-02T10:00:00.000Z'),
  },
  {
    id: 'staging',
    name: 'Staging',
    baseUrl: 'https://staging.example.com',
    apiBaseUrl: null,
    username: null,
    passwordEnvironmentVariable: null,
    credentialState: 'NONE',
    legacyCredentialDetectedAt: null,
    createdAt: new Date('2026-07-03T10:00:00.000Z'),
    updatedAt: new Date('2026-07-04T10:00:00.000Z'),
  },
]

describe('EnvironmentRegistry', () => {
  it('presents environments as runtime cards with their configuration details', () => {
    render(<EnvironmentRegistry environments={environments} />)

    expect(screen.getByRole('heading', { name: 'Runtime registry' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'New environment' })).toHaveAttribute('href', '/environments/create')
    expect(screen.getByRole('heading', { name: 'Local' })).toBeVisible()
    expect(screen.getByText('http://localhost:3000/api')).toBeVisible()
    expect(screen.getByText('qa-user')).toBeVisible()
    expect(screen.getByText('Not configured')).toBeVisible()
    expect(screen.getByText('No username')).toBeVisible()
  })

  it('filters environments by endpoint and reports an empty search state', async () => {
    const user = userEvent.setup()
    render(<EnvironmentRegistry environments={environments} />)

    const search = screen.getByRole('searchbox', { name: 'Search environments' })
    await user.type(search, 'staging.example.com')

    expect(screen.queryByRole('heading', { name: 'Local' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Staging' })).toBeVisible()

    await user.clear(search)
    await user.type(search, 'production')

    expect(screen.getByRole('heading', { name: 'No matching environments' })).toBeVisible()
  })
})
