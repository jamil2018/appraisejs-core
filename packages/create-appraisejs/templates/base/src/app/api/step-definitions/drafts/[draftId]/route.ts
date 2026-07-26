import {
  deleteStepDefinitionDraftAction,
  readStepDefinitionDraftAction,
  reviseStepDefinitionDraftAction,
} from '@/actions/step-definition/step-definition-actions'
import { readStepDefinitionBody, stepDefinitionResponse } from '../../response'

type RouteContext = { params: Promise<{ draftId: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { draftId } = await context.params
  return stepDefinitionResponse(await readStepDefinitionDraftAction(draftId))
}

export async function PATCH(request: Request, context: RouteContext) {
  const { draftId } = await context.params
  const body = (await readStepDefinitionBody(request)) as {
    expectedRevision?: number
    definition?: unknown
  } | null
  return stepDefinitionResponse(
    await reviseStepDefinitionDraftAction({
      draftId,
      expectedRevision: body?.expectedRevision ?? 0,
      definition: body?.definition,
    }),
  )
}

export async function DELETE(request: Request, context: RouteContext) {
  const { draftId } = await context.params
  const body = (await readStepDefinitionBody(request)) as { expectedRevision?: number } | null
  return stepDefinitionResponse(
    await deleteStepDefinitionDraftAction({ draftId, expectedRevision: body?.expectedRevision ?? 0 }),
  )
}
