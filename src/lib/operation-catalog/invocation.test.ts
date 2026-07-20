import { describe, expect, it } from 'vitest'

import { buildCanonicalInvocationJson, buildCanonicalStepBlockOperation, isMappedOperationTemplate } from './invocation'

const mapping = {
  operationId: 'browser.forms.fill',
  operationVersion: '1',
  operationDescriptorHash: `sha256:${'a'.repeat(64)}`,
  humanProjectionId: 'browser.forms.fill.gherkin',
  operationMigrationState: 'mapped',
}

describe('canonical human invocation projection', () => {
  it('writes deterministic operation authority while retaining readable presentation', () => {
    const first = buildCanonicalInvocationJson(mapping, {
      gherkinStep: 'When the user fills a note title',
      parameters: [
        { name: 'value', value: 'Notice' },
        { name: 'target', value: 'title-input' },
      ],
    })
    const second = buildCanonicalInvocationJson(mapping, {
      gherkinStep: 'When the user fills a note title',
      parameters: [
        { name: 'target', value: 'title-input' },
        { name: 'value', value: 'Notice' },
      ],
    })
    expect(first).toBe(second)
    expect(JSON.parse(first!)).toMatchObject({
      operation: { id: 'browser.forms.fill', version: '1' },
      inputs: { target: 'title-input', value: 'Notice' },
      presentation: { keyword: 'When' },
    })
  })

  it('keeps unmigrated legacy and custom steps on the compatibility reader', () => {
    expect(
      buildCanonicalInvocationJson(
        { ...mapping, operationDescriptorHash: null },
        { gherkinStep: 'When x', parameters: [] },
      ),
    ).toBeNull()
    expect(
      buildCanonicalInvocationJson(
        { ...mapping, operationMigrationState: 'manual-only-custom' },
        { gherkinStep: 'When x', parameters: [] },
      ),
    ).toBeNull()
  })

  it('builds one stable persisted operation shape for Step Blocks', () => {
    const operation = buildCanonicalStepBlockOperation({
      ...mapping,
      signature: 'the user fills {target} with {value}',
      parameters: [{ name: 'value' }, { name: 'target' }],
    })

    expect(operation).toMatchObject({
      parameterMap: '{"target":"target","value":"value"}',
      compositionVersionHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })
    expect(JSON.parse(operation!.operationInvocationJson)).toMatchObject({
      operation: { id: 'browser.forms.fill', version: '1' },
      inputs: { target: { $parameter: 'target' }, value: { $parameter: 'value' } },
    })
    expect(isMappedOperationTemplate(mapping)).toBe(true)
    expect(
      buildCanonicalStepBlockOperation({
        ...mapping,
        operationMigrationState: 'manual-only-custom',
        signature: 'custom',
        parameters: [],
      }),
    ).toBeNull()
  })
})
