import * as prismaEnums from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import { createAuthoredFlowNode } from '@/components/diagram/authored-flow-model'
import type { StepDefinitionOption } from '@/types/step-definition-option'

import { validateScenarioTopology } from './test-case-form-helpers'

// Static schema enums only: never importOriginal/importActual or load the generated Prisma runtime.
// Vitest rejects access to any runtime export absent from this file-local factory.
vi.mock('@prisma/client', () => ({
  StepParameterType: Object.freeze({
    NUMBER: 'NUMBER',
    STRING: 'STRING',
    DATE: 'DATE',
    BOOLEAN: 'BOOLEAN',
    LOCATOR: 'LOCATOR',
  }),
  StepIcon: Object.freeze({
    MOUSE: 'MOUSE',
    NAVIGATION: 'NAVIGATION',
    INPUT: 'INPUT',
    DOWNLOAD: 'DOWNLOAD',
    API: 'API',
    STORE: 'STORE',
    FORMAT: 'FORMAT',
    DATA: 'DATA',
    UPLOAD: 'UPLOAD',
    WAIT: 'WAIT',
    VALIDATION: 'VALIDATION',
    DEBUG: 'DEBUG',
  }),
}))

const definition: StepDefinitionOption = {
  reference: { id: 'browser.navigation.goto', version: '1', definitionHash: 'sha256:ready' },
  title: 'Navigate to URL',
  description: 'Navigates to a URL.',
  signature: 'the user navigates to the {url} url',
  keywordCompatibility: ['Given'],
  groupId: 'browser',
  inputs: [{ name: 'url', type: 'string', required: true, defaultValue: '/' }],
}

describe('validateScenarioTopology', () => {
  it('keeps the Prisma mock enum-only and rejects runtime client access', () => {
    expect(Object.keys(prismaEnums).sort()).toEqual(['StepIcon', 'StepParameterType'])
    expect(() => Reflect.get(prismaEnums, 'PrismaClient')).toThrow(/No "PrismaClient" export is defined/)
  })

  it('rejects malformed node orders and non-contiguous flow-block membership before form submission', () => {
    const first = createAuthoredFlowNode(definition, 'first')
    const second = { ...createAuthoredFlowNode(definition, 'second'), order: 2 }
    const third = { ...createAuthoredFlowNode(definition, 'third'), order: 3 }

    expect(
      validateScenarioTopology({ first, second, third }, [{ id: 'setup', name: 'Setup', nodeIds: ['first', 'third'] }]),
    ).toBe('Flow blocks must contain distinct, contiguous nodes from the authored flow.')
    expect(validateScenarioTopology({ first, second: { ...second, order: 3 } }, [])).toContain('contiguous')
  })

  it('accepts the same canonical topology that the form persists', () => {
    const first = createAuthoredFlowNode(definition, 'first')
    const second = { ...createAuthoredFlowNode(definition, 'second'), order: 2 }

    expect(
      validateScenarioTopology({ first, second }, [{ id: 'setup', name: 'Setup', nodeIds: ['first', 'second'] }]),
    ).toBe(undefined)
  })
})
