import { previewStepDefinitionDraftAction } from '@/actions/step-definition/step-definition-actions'
import { stepDefinitionResponse } from '../../../response'

export async function POST(_request: Request, context: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await context.params
  return stepDefinitionResponse(await previewStepDefinitionDraftAction(draftId))
}
