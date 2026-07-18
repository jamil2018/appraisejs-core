// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ValidationAstPreview } from './validation-ast-preview'

describe('ValidationAstPreview', () => {
  it('renders proposed steps and semantic warnings before compilation', () => {
    render(
      <ValidationAstPreview
        preview={{
          schemaVersion: 1,
          astId: 'home-chores-validation',
          title: 'HomeChores validation',
          purpose: 'Verify grocery persistence.',
          valid: true,
          previewHash: `sha256:${'a'.repeat(64)}`,
          receiptHash: `sha256:${'b'.repeat(64)}`,
          blockers: [],
          warnings: [
            {
              code: 'semantic-persistence-target-destroyed',
              message: 'The persisted entity was removed before observation.',
              scenarioId: 'manage-groceries',
              stepId: 'observe-bread',
            },
          ],
          scenarios: [
            {
              id: 'manage-groceries',
              title: 'Manage groceries',
              steps: [
                {
                  id: 'reload-page',
                  keyword: 'When',
                  description: 'the user reloads the page',
                  actionId: 'browser.navigation.reload@1',
                },
              ],
            },
          ],
          coverage: [
            {
              kind: 'quality-concern',
              targetId: 'persistence',
              state: 'covered',
              scenarioIds: ['manage-groceries'],
              observationStepIds: ['observe-bread'],
            },
          ],
        }}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Validation AST review preview' })).toBeInTheDocument()
    expect(screen.getByText('the user reloads the page')).toBeInTheDocument()
    expect(screen.getByText('The persisted entity was removed before observation.')).toBeInTheDocument()
    expect(screen.getByText('persistence: covered')).toBeInTheDocument()
  })
})
