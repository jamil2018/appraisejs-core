import { expect, it } from 'vitest'
import {
  builtInStepDefinitions,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions'
import { classifyJourneyExecutionEffects } from './execution-effects'
function input(id: string) {
  const definition = builtInStepDefinitions.find(item => item.identity.id === id)!
  if (!definition) throw new Error(`Missing test definition ${id}`)
  return {
    invocation: {
      step: { id, version: definition.identity.version, definitionHash: computeStepReferenceHash(definition) },
      inputs: {},
    },
    row: { id, version: definition.identity.version, definitionJson: JSON.stringify(definition) },
  }
}
it.each([
  'browser.assertions.visible',
  'browser.assertions.persisted',
  'browser.wait.wait.for.element',
  'browser.wait.wait.for.element.to.disappear',
  'browser.assertions.hidden',
  'browser.assertions.text',
  'browser.navigation.navigate.to.environment.base.url',
])('does not gate reviewed read-only operation %s', id => {
  const { invocation, row } = input(id)
  expect(classifyJourneyExecutionEffects([invocation], [row])).toEqual({ harmless: true, actions: [] })
})
it.each(['browser.forms.fill', 'browser.forms.fill.configured.credential'])(
  'shows the exact material operation requiring consent: %s',
  id => {
    const { invocation, row } = input(id)
    const result = classifyJourneyExecutionEffects([invocation], [row])
    expect(result.harmless).toBe(false)
    expect(result.actions[0]).toContain(`${id}@1`)
    if (id.includes('credential')) expect(result.actions[0]).toContain('CREDENTIAL_USE')
  },
)
it('fails closed for missing or changed definition bytes', () => {
  const { invocation, row } = input('browser.assertions.visible')
  expect(classifyJourneyExecutionEffects([invocation], []).harmless).toBe(false)
  invocation.step.definitionHash = `sha256:${'0'.repeat(64)}`
  expect(classifyJourneyExecutionEffects([invocation], [row]).actions[0]).toContain('CHANGED_STEP')
})
