import {
  readStepDefinitionDraftArtifactAction,
  saveStepDefinitionDraftArtifactAction,
} from '@/actions/step-definition/step-definition-actions'
import { readStepDefinitionBody, stepDefinitionResponse } from '../../../response'

type RouteContext = { params: Promise<{ draftId: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { draftId } = await context.params
  return stepDefinitionResponse(await readStepDefinitionDraftArtifactAction(draftId))
}

export async function PUT(request: Request, context: RouteContext) {
  const { draftId } = await context.params
  const body = Object.assign({ expectedRevision: 0, artifact: null }, await readStepDefinitionBody(request))
  return stepDefinitionResponse(
    await saveStepDefinitionDraftArtifactAction({
      draftId,
      expectedRevision: body.expectedRevision,
      artifact: body.artifact,
    }),
  )
}
