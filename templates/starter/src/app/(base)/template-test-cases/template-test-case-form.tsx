'use client'
import React, { useCallback, useState } from 'react'

import TemplateTestCaseFlow from './template-test-case-flow'
import type { FlowBlock, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'
import {
  type Locator,
  type LocatorGroup,
  type Environment,
  type Module,
  type TemplateStep,
  type TemplateStepParameter,
} from '@prisma/client'
import { useRouter } from 'next/navigation'
import { z } from 'zod'

import ErrorMessage from '@/components/form/error-message'
import { TestScenarioPreview } from '@/components/test-case/test-scenario-preview'
import {
  buildScenarioPreview,
  buildScenarioSteps,
  handleTestCaseSaveResponse,
  templateTestCaseSubmitSchema,
} from '@/components/test-case/test-case-form-helpers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { templateTestCaseSchema } from '@/constants/form-opts/template-test-case-form-opts'
import { toast } from '@/hooks/use-toast'
import type { ActionResponse } from '@/types/form/actionHandler'

type TemplateTestCaseFormProps = {
  defaultNodesOrder: TemplateTestCaseNodeOrderMap
  templateStepParams: TemplateStepParameter[]
  templateSteps: TemplateStep[]
  locators: Array<Pick<Locator, 'id' | 'name' | 'locatorGroupId'>>
  locatorGroups: Array<Pick<LocatorGroup, 'id' | 'name' | 'route' | 'moduleId'>>
  environments: Array<Pick<Environment, 'id' | 'name'>>
  modules: Array<Pick<Module, 'id' | 'name' | 'parentId'>>
  onSubmitAction: (value: z.infer<typeof templateTestCaseSchema>, id?: string) => Promise<ActionResponse>
  id?: string
  defaultTitle?: string
  defaultDescription?: string
  defaultValueInput?: boolean
  defaultFlowBlocks?: FlowBlock[]
}

const TemplateTestCaseForm = ({
  defaultNodesOrder,
  templateStepParams,
  templateSteps,
  locators,
  locatorGroups,
  environments,
  modules,
  id,
  defaultTitle,
  defaultDescription,
  defaultValueInput = false,
  defaultFlowBlocks = [],
  onSubmitAction,
}: TemplateTestCaseFormProps) => {
  const router = useRouter()
  const [nodesOrder, setNodesOrder] = useState<TemplateTestCaseNodeOrderMap>(defaultNodesOrder)
  const [flowBlocks, setFlowBlocks] = useState<FlowBlock[]>(defaultFlowBlocks)
  const [title, setTitle] = useState(defaultTitle || '')
  const [description, setDescription] = useState(defaultDescription || '')
  const [errors, setErrors] = useState<{
    title?: string[]
    description?: string[]
    steps?: string[]
  }>({})

  const scenarioPreview = buildScenarioPreview(title, description, nodesOrder)
  const renderError = (message?: string[]) => <ErrorMessage message={message?.[0] || ''} visible={!!message} />

  const onNodeOrderChange = useCallback((nodesOrder: TemplateTestCaseNodeOrderMap) => {
    setNodesOrder(nodesOrder)
  }, [])

  const onTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
  }, [])

  const onDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value)
  }, [])

  const handleSubmit = useCallback(async () => {
    const result = templateTestCaseSubmitSchema.safeParse({
      title,
      description,
      steps: buildScenarioSteps(nodesOrder),
      flowBlocks,
    })

    if (!result.success) {
      setErrors(result.error.flatten().fieldErrors)
      return
    }
    setErrors({})
    const response = await onSubmitAction(result.data, id)
    handleTestCaseSaveResponse({ response, redirectPath: '/template-test-cases', push: router.push, toast })
  }, [description, nodesOrder, title, router, onSubmitAction, id, flowBlocks])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between gap-8" id="meta">
        <div className="w-1/2">
          <div className="mb-4 flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" value={title} onChange={onTitleChange} />
            {renderError(errors.title)}
          </div>
          <div className="mb-4 flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" value={description} onChange={onDescriptionChange} />
            {renderError(errors.description)}
          </div>
        </div>
        <div className="w-1/2">
          <div className="mb-4 flex flex-col gap-2">
            <TestScenarioPreview title="Test Scenario(Preview)" scenario={scenarioPreview} />
          </div>
        </div>
      </div>
      <div className="mb-4 flex h-[500px] flex-col gap-2">
        <TemplateTestCaseFlow
          initialNodesOrder={nodesOrder}
          templateStepParams={templateStepParams}
          templateSteps={templateSteps}
          onNodeOrderChange={onNodeOrderChange}
          locators={locators}
          locatorGroups={locatorGroups}
          environments={environments}
          modules={modules}
          defaultValueInput={defaultValueInput}
          flowBlocks={flowBlocks}
          onFlowBlocksChange={setFlowBlocks}
        />
      </div>
      {renderError(errors.steps)}
      <div className="mb-4 flex flex-col gap-2">
        <Button onClick={handleSubmit} className="w-fit px-6">
          Save
        </Button>
      </div>
    </div>
  )
}

export default TemplateTestCaseForm
