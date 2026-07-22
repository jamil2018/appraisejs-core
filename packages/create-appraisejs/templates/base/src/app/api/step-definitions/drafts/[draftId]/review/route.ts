import { reviewStepDefinitionDraftAction } from '@/actions/step-definition/step-definition-actions'
import { readStepDefinitionBody, stepDefinitionResponse } from '../../../response'

export async function POST(request: Request, context: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await context.params
  const body = Object.assign({ expectedRevision: 0, reviewAuthority: '' }, await readStepDefinitionBody(request))
  return stepDefinitionResponse(
    await reviewStepDefinitionDraftAction({
      draftId,
      expectedRevision: body.expectedRevision,
      reviewAuthority: body.reviewAuthority,
    }),
  )
}
