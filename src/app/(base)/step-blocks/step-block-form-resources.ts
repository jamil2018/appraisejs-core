import { getAllTemplateStepsAction } from '@/actions/template-step/template-step-actions'

export async function loadStepBlockFormResources() {
  const templateStepsResponse = await getAllTemplateStepsAction()

  return {
    error: templateStepsResponse.error,
    templateSteps: templateStepsResponse.data,
  }
}
