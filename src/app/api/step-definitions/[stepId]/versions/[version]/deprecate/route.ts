import { deprecateStepDefinitionAction } from '@/actions/step-definition/step-definition-actions'
import { readStepDefinitionBody, stepDefinitionResponse } from '../../../../response'

export async function POST(request: Request, context: { params: Promise<{ stepId: string; version: string }> }) {
  const { stepId, version } = await context.params
  const body = Object.assign({ reason: '', actor: '', replacement: undefined }, await readStepDefinitionBody(request))
  return stepDefinitionResponse(
    await deprecateStepDefinitionAction({
      stepId,
      version,
      reason: body.reason,
      actor: body.actor,
      replacement: body.replacement,
    }),
  )
}
