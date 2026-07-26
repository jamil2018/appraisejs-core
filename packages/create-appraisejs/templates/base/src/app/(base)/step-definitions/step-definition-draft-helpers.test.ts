import { describe, expect, it } from 'vitest'

import {
  applyManagedStepMetadata,
  canonicalDraftDefinitionJson,
  createHumanStepDraft,
  defaultStepInputExampleValue,
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
    expect(reordered.agent.examples[0]?.inputs).toEqual({
      recipient: 'Example recipient',
      message: 'Example message',
    })
  })

  it('synchronizes required agent example values with named inputs and removes stale values', () => {
    const initial = reconcileNamedInputs(createHumanStepDraft(), 'I greet {personName} {repeatCount}')
    initial.agent.examples[0]!.inputs.personName = 'Ada'

    const reconciled = reconcileNamedInputs(initial, 'I greet {personName}')

    expect(reconciled.agent.examples[0]?.inputs).toEqual({ personName: 'Ada' })
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
    expect(managed.human.groupId).toBe('custom')
    expect(managed.agent).toMatchObject({
      summary: 'Send Account Notification',
      usageGuidance: 'Send a notification to an account owner.',
      examples: [expect.objectContaining({ intent: 'Send Account Notification' })],
    })
  })

  it('preserves exact identity and extension version for a successor draft', () => {
    const draft = createHumanStepDraft()
    draft.identity = { id: 'custom.existing-step', version: '2', status: 'draft' }
    draft.lifecycle.supersedes = { id: 'custom.existing-step', version: '1' }
    draft.intent.title = 'A renamed successor'

    const managed = applyManagedStepMetadata(draft)

    expect(managed.identity).toMatchObject({ id: 'custom.existing-step', version: '2' })
    expect(managed.execution).toMatchObject({ extensionId: 'custom.existing-step', extensionVersion: '2' })
  })

  it('generates deterministic human-readable example values for authored inputs', () => {
    const input = reconcileNamedInputs(createHumanStepDraft(), 'I greet {recipientName}').inputs[0]!

    expect(defaultStepInputExampleValue(input)).toBe('Example recipient name')
    expect(defaultStepInputExampleValue({ ...input, type: 'locator' })).toBe('Primary action')
    expect(defaultStepInputExampleValue({ ...input, type: 'json' })).toEqual({ example: true })
  })

  it('restores internal grouping metadata for drafts created before groups were removed from authoring', () => {
    const draft = createHumanStepDraft()
    draft.human.groupId = ''

    expect(applyManagedStepMetadata(draft).human.groupId).toBe('custom')
  })

  it('compares canonical definitions independently of object key order', () => {
    const definition = applyManagedStepMetadata(createHumanStepDraft())
    const reordered = JSON.parse(canonicalDraftDefinitionJson(definition))

    expect(canonicalDraftDefinitionJson(reordered)).toBe(canonicalDraftDefinitionJson(definition))
  })

  it('replaces arbitrary human-form capabilities with the selected execution runtime', () => {
    const draft = createHumanStepDraft()
    draft.intent.capabilities = ['random-text']
    if (draft.execution.kind !== 'reviewed-extension') throw new Error('Expected reviewed extension draft.')
    draft.execution.runtime = 'browser'

    expect(applyManagedStepMetadata(draft).intent.capabilities).toEqual(['browser'])
  })
})
