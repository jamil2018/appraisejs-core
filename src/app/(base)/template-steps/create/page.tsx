import React from 'react'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
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
      <div className="mb-8">
        <PageHeader>Create reusable step</PageHeader>
        <HeaderSubtitle>Author, compile, review, and publish one shared Step Definition</HeaderSubtitle>
      </div>
      <StepDefinitionDraftEditor groups={groups.map(({ id, name, type }) => ({ id, name, type }))} />
    </>
  )
}

export default CreateTemplateStep
