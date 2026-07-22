import { publishStepDefinitionDraftAction } from '@/actions/step-definition/step-definition-actions'
import { readStepDefinitionBody, stepDefinitionResponse } from '../../../response'

export async function POST(request: Request, context: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await context.params
  const body = Object.assign({ expectedRevision: 0, conformanceRunId: '' }, await readStepDefinitionBody(request))
  return stepDefinitionResponse(
    await publishStepDefinitionDraftAction({
      draftId,
      expectedRevision: body.expectedRevision,
      conformanceRunId: body.conformanceRunId,
    }),
  )
}
