// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import ErrorMessage from './error-message'

describe('ErrorMessage', () => {
  it('provides a stable alert target when an error is visible', () => {
    render(<ErrorMessage id="title-error" message="Title is required." visible />)

    expect(screen.getByRole('alert')).toHaveAttribute('id', 'title-error')
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required.')
  })

  it('retains its description target without announcing an absent error', () => {
    const { container } = render(<ErrorMessage id="title-error" message="" visible={false} />)

    expect(container.querySelector('#title-error')).not.toHaveAttribute('role')
  })
})
