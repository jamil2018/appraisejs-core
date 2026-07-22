import React from 'react'
import { LayoutTemplate } from 'lucide-react'
import { Metadata } from 'next'
import { StepDefinitionDraftEditor } from '../step-definition-draft-editor'
import { listTemplateStepGroups } from '@/services/template-step-group/template-step-group-service'

export const metadata: Metadata = {
  title: 'Appraise | Create Reusable Step',
  description: 'Create and publish a shared reusable Step Definition',
}

const CreateTemplateStep = async () => {
  const groups = await listTemplateStepGroups()
  return (
    <>
      <div className="mb-6 flex items-start gap-3 border-b border-white/[0.06] pb-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/[0.06] text-indigo-300">
          <LayoutTemplate className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-indigo-300">Reusable step library</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-zinc-100">Create reusable step</h1>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-zinc-400">
            Define the readable contract first, then connect and verify its implementation before publishing.
          </p>
        </div>
      </div>
      <StepDefinitionDraftEditor
        groups={groups.map(({ id, name, type, description }) => ({ id, name, type, description }))}
      />
    </>
  )
}

export default CreateTemplateStep
