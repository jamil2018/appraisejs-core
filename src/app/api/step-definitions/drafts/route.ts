import { createStepDefinitionDraftAction } from '@/actions/step-definition/step-definition-actions'
import { readStepDefinitionBody, stepDefinitionResponse } from '../response'

export async function POST(request: Request) {
  return stepDefinitionResponse(await createStepDefinitionDraftAction(await readStepDefinitionBody(request)))
}
