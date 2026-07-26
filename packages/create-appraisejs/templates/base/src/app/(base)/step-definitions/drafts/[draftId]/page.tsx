import { notFound } from 'next/navigation'

import {
  readStepDefinitionDraftAction,
  readStepDefinitionDraftArtifactAction,
} from '@/actions/step-definition/step-definition-actions'
import { StepDefinitionDraftEditor, type StepDefinitionEditorDraft } from '../../step-definition-draft-editor'

export const metadata = {
  title: 'Appraise | Resume Reusable Step',
  description: 'Resume a shared Step Definition draft',
}

function initialStageFrom(value?: string) {
  const stage = Number(value)
  return Number.isInteger(stage) && stage >= 0 && stage <= 3 ? stage : 0
}

export default async function ResumeStepDefinitionDraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ draftId: string }>
  searchParams: Promise<{ stage?: string }>
}) {
  const { draftId } = await params
  const initialStage = initialStageFrom((await searchParams).stage)
  const [draftResponse, artifactResponse] = await Promise.all([
    readStepDefinitionDraftAction(draftId),
    readStepDefinitionDraftArtifactAction(draftId),
  ])
  if (!draftResponse.success) notFound()
  const draft = draftResponse.data as StepDefinitionEditorDraft
  return (
    <StepDefinitionDraftEditor
      initialStage={initialStage}
      initialDraft={{
        ...draft,
        artifact: artifactResponse.success ? (artifactResponse.data as StepDefinitionEditorDraft['artifact']) : null,
      }}
    />
  )
}
