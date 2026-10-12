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
      <header className="mb-4 flex items-start gap-3 rounded-xl border border-white/[0.09] bg-[linear-gradient(145deg,rgba(255,255,255,0.05),rgba(255,255,255,0.014))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-18px_36px_rgba(0,0,0,0.12),0_18px_50px_-38px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:p-6">
        <div className="border-primary/20 bg-primary/[0.07] flex size-10 shrink-0 items-center justify-center rounded-full border text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
          <LayoutTemplate aria-hidden="true" className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-primary/90 text-[11px] font-medium uppercase tracking-[0.08em]">Reusable step library</p>
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
