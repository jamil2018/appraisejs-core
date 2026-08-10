import { createStepDefinitionVersionDraftAction } from '@/actions/step-definition/step-definition-actions'
import { readStepDefinitionBody, stepDefinitionResponse } from '../../../../response'

export async function POST(request: Request, context: { params: Promise<{ stepId: string; version: string }> }) {
  const { stepId, version } = await context.params
  const body = Object.assign({ newVersion: '', createdBy: 'local-user' }, await readStepDefinitionBody(request))
  return stepDefinitionResponse(
    await createStepDefinitionVersionDraftAction({
      stepId,
      version,
      newVersion: body.newVersion,
      createdBy: body.createdBy,
    }),
  )
}
