import { describe, expect, it } from 'vitest'

import { templateTestCaseToTestCaseConverter, validateConvertedTestCaseData } from './template-test-case-converter'

const invocation = {
  step: { id: 'browser.form.fill', version: '1', definitionHash: `sha256:${'a'.repeat(64)}` },
  inputs: { email: 'qa@appraise.dev', options: { retries: 2, enabled: true, values: [null, 'value'] } },
  store: { output: 'result', as: 'savedResult' },
  presentation: { keyword: 'When' as const, description: 'Fill email' },
}

function templateFixture(): Parameters<typeof templateTestCaseToTestCaseConverter>[0] {
  return {
    id: 'template-1',
    name: 'Login flow',
    description: 'Reusable login flow',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    targetProjectId: 'project-1',
    archivedAt: null,
    collaborationManaged: false,
    archiveVersion: 0,
    steps: [
      {
        id: 'step-1',
        templateTestCaseId: 'template-1',
        collaborationPortableId: null,
        flowNodeId: 'auth-email',
        order: 4,
        label: 'Fill email',
        gherkinStep: 'fill email',
        icon: 'INPUT',
        invocationJson: JSON.stringify(invocation),
        parameters: [
          {
            id: 'parameter-1',
            testCaseStepId: 'step-1',
            name: 'email',
            defaultValue: 'qa@appraise.dev',
            type: 'STRING',
            order: 2,
            locatorId: null,
            defaultLocatorId: null,
          },
        ],
      },
    ],
    flowBlocks: [
      {
        id: 'block-1',
        templateTestCaseId: 'template-1',
        collaborationPortableId: null,
        name: 'Authentication',
        order: 3,
        nodes: [{ id: 'block-node-1', flowBlockId: 'block-1', flowNodeId: 'auth-email' }],
      },
    ],
  }
}

describe('template test case conversion', () => {
  it('preserves exact invocations, flow identities, parameter defaults and display data', () => {
    const template = templateFixture()
    const original = structuredClone(template)
    const converted = templateTestCaseToTestCaseConverter(template)

    expect(converted).toEqual({
      title: 'Login flow',
      description: 'Reusable login flow',
      testSuiteIds: [],
      nodesOrder: {
        'auth-email': {
          nodeId: 'auth-email',
          order: 4,
          label: 'Fill email',
          gherkinStep: 'fill email',
          icon: 'INPUT',
          parameters: [{ name: 'email', value: 'qa@appraise.dev', type: 'STRING', order: 2 }],
          invocation,
        },
      },
      flowBlocks: [{ id: 'block-1', name: 'Authentication', nodeIds: ['auth-email'] }],
    })
    expect(validateConvertedTestCaseData(converted)).toEqual({ isValid: true, errors: [] })
    expect(template).toEqual(original)
  })

  it('keeps positional node fallback and absent description or flow block defaults', () => {
    const template = templateFixture()
    template.description = null
    template.flowBlocks = undefined
    template.steps[0].flowNodeId = null

    const converted = templateTestCaseToTestCaseConverter(template)
    expect(converted.description).toBe('')
    expect(converted.flowBlocks).toEqual([])
    expect(Object.keys(converted.nodesOrder)).toEqual(['node-0'])
    expect(converted.nodesOrder['node-0'].invocation).toEqual(invocation)
  })

  it.each([
    ['missing exact definition hash', { ...invocation, step: { id: invocation.step.id, version: '1' } }],
    ['malformed definition hash', { ...invocation, step: { ...invocation.step, definitionHash: 'sha256:abc' } }],
    ['extra invocation fields', { ...invocation, unexpected: true }],
    ['invalid input identifier', { ...invocation, inputs: { 'not an identifier': 'value' } }],
  ])('rejects %s instead of creating a partially valid converted case', (_reason, invalidInvocation) => {
    const template = templateFixture()
    template.steps[0].invocationJson = JSON.stringify(invalidInvocation)
    expect(() => templateTestCaseToTestCaseConverter(template)).toThrow()
  })

  it('continues to reject malformed serialized invocation JSON', () => {
    const template = templateFixture()
    template.steps[0].invocationJson = '{invalid'
    expect(() => templateTestCaseToTestCaseConverter(template)).toThrow(SyntaxError)
  })
})
