// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ExactExecutionPreview } from './exact-execution-preview'

describe('ExactExecutionPreview', () => {
  it('renders immutable identities and reviewed runtime selections', () => {
    render(
      <ExactExecutionPreview
        preview={{
          operationId: 'operation-one',
          phase: 'review_ready',
          hashes: {
            astHash: 'sha256:ast',
            contextHash: 'sha256:context',
            previewHash: 'sha256:preview',
            receiptHash: 'sha256:receipt',
            projectionHash: 'sha256:projection',
            runtimeInputHash: 'sha256:runtime',
          },
          operations: [{ id: 'browser.forms.fill', version: '1' }],
          locators: [{ id: 'title-input', version: '1' }],
          scenarios: [{ scenarioId: 'create-todo', stepIds: ['fill-title'] }],
          matrix: [{ browser: 'chromium', environment: 'local' }],
          gherkin: ['Scenario: Create todo'],
        }}
      />,
    )
    expect(screen.getByText('browser.forms.fill@1')).toBeInTheDocument()
    expect(screen.getByText('title-input@1')).toBeInTheDocument()
    expect(screen.getByText('Scenario: Create todo')).toBeInTheDocument()
    expect(screen.getByText('sha256:runtime')).toBeInTheDocument()
  })
})
