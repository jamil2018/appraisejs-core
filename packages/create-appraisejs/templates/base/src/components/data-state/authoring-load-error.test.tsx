// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import AuthoringLoadError from './authoring-load-error'

describe('AuthoringLoadError', () => {
  it.each([
    'Server error occurred: Shared resource mutation requires exact coverage and association proof.',
    'The selected test case could not be found.',
  ])('retains navigation and collapsed diagnostic detail for %s', message => {
    render(
      <AuthoringLoadError
        title="Modify Test Case"
        listHref="/test-cases"
        listLabel="Back to test cases"
        message={message}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Modify Test Case' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Form unavailable')
    expect(screen.getByRole('alert')).toHaveTextContent('No changes were made.')
    expect(screen.getByRole('link', { name: 'Back to test cases' })).toHaveAttribute('href', '/test-cases')
    expect(screen.getByText(message).closest('details')).not.toHaveAttribute('open')
    expect(screen.getByText('Error details')).toBeInTheDocument()
  })
})
