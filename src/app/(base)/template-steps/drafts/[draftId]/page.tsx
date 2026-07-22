import { notFound } from 'next/navigation'

import {
  readStepDefinitionDraftAction,
  readStepDefinitionDraftArtifactAction,
} from '@/actions/step-definition/step-definition-actions'
import { StepDefinitionDraftEditor, type StepDefinitionEditorDraft } from '../../step-definition-draft-editor'

export default async function ResumeStepDefinitionDraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params
  const [draftResponse, artifactResponse] = await Promise.all([
    readStepDefinitionDraftAction(draftId),
    readStepDefinitionDraftArtifactAction(draftId),
  ])
  if (!draftResponse.success) notFound()
  const draft = draftResponse.data as StepDefinitionEditorDraft
  return (
    <StepDefinitionDraftEditor
      initialDraft={{
        ...draft,
        artifact: artifactResponse.success ? (artifactResponse.data as StepDefinitionEditorDraft['artifact']) : null,
      }}
    />
  )
}
