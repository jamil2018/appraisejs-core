// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { CheckCircle } from 'lucide-react'
import { describe, expect, it } from 'vitest'

import { StatusBadge } from './status-badge'

describe('StatusBadge', () => {
  it('keeps the semantic label available with an icon', () => {
    render(<StatusBadge label="Passed" tone="success" icon={<CheckCircle />} />)

    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(screen.getByText('Passed').parentElement).toHaveClass('border-emerald-400/25')
  })
})
