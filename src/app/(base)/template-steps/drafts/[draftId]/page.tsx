import { notFound } from 'next/navigation'

import {
  readStepDefinitionDraftAction,
  readStepDefinitionDraftArtifactAction,
} from '@/actions/step-definition/step-definition-actions'
import { StepDefinitionDraftEditor, type StepDefinitionEditorDraft } from '../../step-definition-draft-editor'
import { listTemplateStepGroups } from '@/services/template-step-group/template-step-group-service'

export const metadata = {
  title: 'Appraise | Resume Reusable Step',
  description: 'Resume a shared Step Definition draft',
}

export default async function ResumeStepDefinitionDraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params
  const [draftResponse, artifactResponse, groups] = await Promise.all([
    readStepDefinitionDraftAction(draftId),
    readStepDefinitionDraftArtifactAction(draftId),
    listTemplateStepGroups(),
  ])
  if (!draftResponse.success) notFound()
  const draft = draftResponse.data as StepDefinitionEditorDraft
  return (
    <StepDefinitionDraftEditor
      initialDraft={{
        ...draft,
        artifact: artifactResponse.success ? (artifactResponse.data as StepDefinitionEditorDraft['artifact']) : null,
      }}
      groups={groups.map(({ id, name, type, description }) => ({ id, name, type, description }))}
    />
  )
}
