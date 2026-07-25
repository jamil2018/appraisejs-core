import { listReadyStepDefinitionOptionsAction } from '@/actions/step-definition/step-definition-actions'

export async function loadStepBlockFormResources() {
  const stepDefinitionsResponse = await listReadyStepDefinitionOptionsAction()

  return {
    error: stepDefinitionsResponse.error,
    stepDefinitions: stepDefinitionsResponse.data,
  }
}
