import { describe, expect, it } from 'vitest'

import {
  applyManagedStepMetadata,
  createHumanStepDraft,
  draftContractSource,
  reconcileNamedInputs,
  stepDefinitionIdFromTitle,
} from './step-definition-draft-helpers'

describe('Step Definition draft helpers', () => {
  it('creates stable named bindings and preserves input metadata across reorder', () => {
    const initial = reconcileNamedInputs(createHumanStepDraft(), 'I send {message} to {recipient}')
    const described = {
      ...initial,
      inputs: initial.inputs.map(input =>
        input.name === 'recipient' ? { ...input, description: 'Stable recipient identity.' } : input,
      ),
    }

    const reordered = reconcileNamedInputs(described, 'I send {recipient} the {message}')

    expect(reordered.inputs.map(input => input.name)).toEqual(['recipient', 'message'])
    expect(reordered.inputs[0]?.description).toBe('Stable recipient identity.')
    expect(reordered.human.parameterBindings).toEqual([
      { placeholder: 'recipient', input: 'recipient' },
      { placeholder: 'message', input: 'message' },
    ])
  })

  it('generates deterministic contract source from typed inputs', () => {
    const definition = reconcileNamedInputs(createHumanStepDraft(), 'I wait {duration}')
    definition.inputs[0]!.type = 'number'
    expect(draftContractSource(definition)).toContain('readonly duration: number')
  })

  it('generates the initial identity, version, and search terms from authored metadata', () => {
    const draft = createHumanStepDraft()
    draft.intent.title = 'Send Account Notification'
    draft.intent.description = 'Send a notification to an account owner.'
    draft.human.signature = 'I notify {accountName}'

    const managed = applyManagedStepMetadata(draft)

    expect(stepDefinitionIdFromTitle(draft.intent.title)).toBe('custom.send-account-notification')
    expect(managed.identity).toMatchObject({ id: 'custom.send-account-notification', version: '1' })
    expect(managed.intent.searchTerms).toEqual(expect.arrayContaining(['send', 'account', 'notification', 'notify']))
    expect(managed.execution).toMatchObject({ extensionId: managed.identity.id, extensionVersion: '1' })
  })
})
