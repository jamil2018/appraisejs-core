import { defaultOperationDefinitions } from '@/lib/operation-catalog'
import {
  computeStepReferenceHash,
  stepDefinitionSchema,
  stepInvocationSchema,
} from '../../../packages/cucumber-runtime/src/step-definitions'
import type { z } from 'zod'

// Reviewed read/assert operation versions. New versions and unknown handlers
// require consent until their effects have been reviewed explicitly.
const harmlessOperations = new Set([
  'browser.active.state.assertion.assert.element.active@1',
  'browser.assertions.accessible@1',
  'browser.assertions.checked@1',
  'browser.assertions.hidden@1',
  'browser.assertions.no-console-errors@1',
  'browser.assertions.no-failed-network-requests@1',
  'browser.assertions.no-horizontal-overflow@1',
  'browser.assertions.text@1',
  'browser.assertions.ordered.texts@1',
  'browser.assertions.text-contains@1',
  'browser.assertions.value@1',
  'browser.assertions.visibility@1',
  'browser.assertions.visible@1',
  'browser.assertions.persisted@1',
  'browser.browser.assertion.assert.browser.cookie@1',
  'browser.browser.assertion.assert.full.url@1',
  'browser.browser.assertion.assert.local.storage.value@1',
  'browser.browser.assertion.assert.page.title@1',
  'browser.browser.assertion.assert.session.storage.value@1',
  'browser.browser.assertion.assert.url.contains@1',
  'browser.download.assertion.assert.download.path.available@1',
  'browser.download.assertion.assert.downloaded.filename@1',
  'browser.download.assertion.assert.stored.download.filename@1',
  'browser.element.property.assertion.assert.element.attribute@1',
  'browser.element.property.assertion.assert.element.bounding.box@1',
  'browser.element.property.assertion.assert.element.class@1',
  'browser.element.property.assertion.assert.element.count@1',
  'browser.element.property.assertion.assert.element.css.property@1',
  'browser.element.state.assertion.assert.element.attached@1',
  'browser.element.state.assertion.assert.element.editable@1',
  'browser.element.state.assertion.assert.element.empty@1',
  'browser.element.state.assertion.assert.element.enabled@1',
  'browser.element.state.assertion.assert.element.focused@1',
  'browser.navigation.assertion.assert.url.route.equals@1',
  'browser.text.assertion.assert.element.contains.stored.variable.text@1',
  'browser.text.assertion.assert.element.equals.text@1',
  'browser.navigation.navigate.to.environment.base.url@1',
  'browser.wait.wait.for.element@1',
  'browser.wait.wait.for.element.to.disappear@1',
  'browser.wait.wait.for.url.route@1',
  'browser.synchronization.wait.for.url@1',
  'browser.synchronization.wait.for.load.state@1',
  'browser.synchronization.wait.for.element.state@1',
  'browser.synchronization.wait.for.element.text@1',
  'browser.synchronization.wait.for.input.value@1',
  'browser.synchronization.wait.for.request@1',
  'browser.synchronization.wait.for.response@1',
  'browser.synchronization.wait.for.popup@1',
  'browser.waits.timeout@1',
  'browser.waits.duration@1',
  'browser.waits.page-ready@1',
])

type Invocation = z.infer<typeof stepInvocationSchema>
export function classifyJourneyExecutionEffects(
  invocations: Invocation[],
  definitions: Array<{ id: string; version: string; definitionJson: string }>,
) {
  const byRef = new Map(definitions.map(definition => [`${definition.id}@${definition.version}`, definition]))
  const actions = invocations.flatMap(invocation => {
    const ref = `${invocation.step.id}@${invocation.step.version}`
    const definition = byRef.get(ref)
    if (!definition) return [`UNRESOLVED_STEP:${ref}`]
    const parsed = stepDefinitionSchema.parse(JSON.parse(definition.definitionJson))
    if (computeStepReferenceHash(parsed) !== invocation.step.definitionHash) return [`CHANGED_STEP:${ref}`]
    const execution = parsed.execution
    if (execution.kind !== 'operation') return [`CUSTOM_EXECUTION:${ref}`]
    const operation = defaultOperationDefinitions.find(
      item => item.handler.id === execution.handlerId && item.handler.version === execution.handlerVersion,
    )
    if (!operation) return [`UNKNOWN_HANDLER:${execution.handlerId}@${execution.handlerVersion}`]
    const operationRef = `${operation.id}@${operation.version}`
    if (operation.credentialSource) return [`CREDENTIAL_USE:${operationRef}`]
    return harmlessOperations.has(operationRef) ? [] : [`MATERIAL_OR_UNREVIEWED_EFFECT:${operationRef}`]
  })
  if (!invocations.length) actions.push('EMPTY_EXECUTION_SCOPE')
  return { harmless: actions.length === 0, actions: [...new Set(actions)].sort() }
}
