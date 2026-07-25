import type { StepInvocation } from '../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

export type StepDefinitionInputOption = {
  name: string
  type:
    | 'string'
    | 'number'
    | 'boolean'
    | 'json'
    | 'locator'
    | 'environment-ref'
    | 'stored-value-ref'
    | 'artifact-ref'
    | 'reviewed-extension-ref'
  required: boolean
  defaultValue?: unknown
}

export type StepDefinitionOption = {
  reference: StepInvocation['step']
  title: string
  description: string
  signature: string
  keywordCompatibility: Array<'Given' | 'When' | 'Then' | 'And'>
  groupId: string
  inputs: StepDefinitionInputOption[]
}
