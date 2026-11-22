import React from 'react'
import { LayoutTemplate } from 'lucide-react'
import { Metadata } from 'next'
import { StepDefinitionDraftEditor } from '../step-definition-draft-editor'

export const metadata: Metadata = {
  title: 'Appraise | Create Reusable Step',
  description: 'Create and publish a shared reusable Step Definition',
}

const CreateStepDefinition = async () => {
  return (
    <>
      <header className="mb-4 flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-none">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/[0.07] text-primary shadow-none">
          <LayoutTemplate aria-hidden="true" className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-primary/90">Reusable step library</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Create reusable step</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Define the readable contract first, then connect and verify its implementation before publishing.
          </p>
        </div>
      </header>
      <StepDefinitionDraftEditor />
    </>
  )
}

export default CreateStepDefinition
