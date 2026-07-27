'use client'
import React, { useCallback, useMemo, useState } from 'react'

import TemplateTestCaseFlow from './template-test-case-flow'
import type { FlowBlock, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'
import type { StepDefinitionOption } from '@/types/step-definition-option'
import { type Locator, type LocatorGroup, type Environment, type Module } from '@prisma/client'
import { useRouter } from 'next/navigation'
import { Save } from 'lucide-react'
import { z } from 'zod'

import ErrorMessage from '@/components/form/error-message'
import { TestScenarioPreview } from '@/components/test-case/test-scenario-preview'
import { flowFromNodeOrder, nodeOrderFromFlow, type AuthoredFlow } from '@/components/diagram/authored-flow-model'
import {
  useFlowInvocationController,
  useMergedStepDefinitionOptions,
} from '@/components/diagram/flow-invocation-controller'
import { useStepInvocationResources } from '@/components/diagram/step-invocation-resources'
import {
  buildScenarioPreview,
  buildScenarioSteps,
  handleTestCaseSaveResponse,
  templateTestCaseSubmitSchema,
  validateScenarioTopology,
} from '@/components/test-case/test-case-form-helpers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { templateTestCaseSchema } from '@/constants/form-opts/template-test-case-form-opts'
import { toast } from '@/hooks/use-toast'
import type { ActionResponse } from '@/types/form/actionHandler'

function TemplateTestCaseFormFieldError({ message }: { message?: string[] }) {
  return <ErrorMessage message={message?.[0] || ''} visible={!!message} />
}

type TemplateTestCaseFormProps = {
  defaultNodesOrder: TemplateTestCaseNodeOrderMap
  stepDefinitions: StepDefinitionOption[]
  editorDefinitions?: StepDefinitionOption[]
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

const EMPTY_FLOW_BLOCKS: FlowBlock[] = []

type TemplateFormStateOptions = Pick<
  TemplateTestCaseFormProps,
  'defaultNodesOrder' | 'defaultFlowBlocks' | 'defaultTitle' | 'defaultDescription' | 'onSubmitAction' | 'id'
> & {
  push: (path: string) => void
}

function useTemplateTestCaseFormState({
  defaultNodesOrder,
  defaultFlowBlocks = EMPTY_FLOW_BLOCKS,
  defaultTitle,
  defaultDescription,
  onSubmitAction,
  id,
  push,
}: TemplateFormStateOptions) {
  const [nodesOrder, setNodesOrder] = useState<TemplateTestCaseNodeOrderMap>(defaultNodesOrder)
  const [flowBlocks, setFlowBlocks] = useState<FlowBlock[]>(defaultFlowBlocks)
  const [authoringView, setAuthoringView] = useState<'graph' | 'linear'>('graph')
  const [title, setTitle] = useState(defaultTitle || '')
  const [description, setDescription] = useState(defaultDescription || '')
  const [errors, setErrors] = useState<{
    title?: string[]
    description?: string[]
    steps?: string[]
  }>({})
  const handleSubmit = useCallback(async () => {
    const topologyError = validateScenarioTopology(nodesOrder, flowBlocks)
    if (topologyError) {
      setErrors({ steps: [topologyError] })
      return
    }
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
    handleTestCaseSaveResponse({ response, redirectPath: '/template-test-cases', push, toast })
  }, [description, flowBlocks, id, nodesOrder, onSubmitAction, push, title])

  return {
    nodesOrder,
    setNodesOrder,
    flowBlocks,
    setFlowBlocks,
    authoringView,
    setAuthoringView,
    title,
    setTitle,
    description,
    setDescription,
    errors,
    handleSubmit,
  }
}

function TemplateTestCaseMetadata({
  title,
  description,
  errors,
  onTitleChange,
  onDescriptionChange,
  nodesOrder,
}: {
  title: string
  description: string
  errors: { title?: string[]; description?: string[] }
  onTitleChange: (title: string) => void
  onDescriptionChange: (description: string) => void
  nodesOrder: TemplateTestCaseNodeOrderMap
}) {
  const scenarioPreview = buildScenarioPreview(title, description, nodesOrder)
  return (
    <div className="flex justify-between gap-8" id="meta">
      <div className="w-1/2">
        <div className="mb-4 flex flex-col gap-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" value={title} onChange={event => onTitleChange(event.target.value)} />
          <TemplateTestCaseFormFieldError message={errors.title} />
        </div>
        <div className="mb-4 flex flex-col gap-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            value={description}
            onChange={event => onDescriptionChange(event.target.value)}
          />
          <TemplateTestCaseFormFieldError message={errors.description} />
        </div>
      </div>
      <div className="w-1/2">
        <div className="mb-4 flex flex-col gap-2">
          <TestScenarioPreview title="Test Scenario(Preview)" scenario={scenarioPreview} />
        </div>
      </div>
    </div>
  )
}

function FlowAuthoringViewToggle({
  view,
  onChange,
}: {
  view: 'graph' | 'linear'
  onChange: (view: 'graph' | 'linear') => void
}) {
  return (
    <div className="inline-flex w-fit rounded-md border p-1" role="group" aria-label="Flow authoring view">
      <Button
        type="button"
        size="sm"
        variant={view === 'graph' ? 'default' : 'ghost'}
        aria-pressed={view === 'graph'}
        onClick={() => onChange('graph')}
      >
        Graph
      </Button>
      <Button
        type="button"
        size="sm"
        variant={view === 'linear' ? 'default' : 'ghost'}
        aria-pressed={view === 'linear'}
        onClick={() => onChange('linear')}
      >
        Linear
      </Button>
    </div>
  )
}

const TemplateTestCaseForm = ({
  defaultNodesOrder,
  stepDefinitions,
  editorDefinitions = stepDefinitions,
  locators,
  locatorGroups,
  environments,
  modules,
  id,
  defaultTitle,
  defaultDescription,
  defaultValueInput = false,
  defaultFlowBlocks = EMPTY_FLOW_BLOCKS,
  onSubmitAction,
}: TemplateTestCaseFormProps) => {
  const { push } = useRouter()
  const form = useTemplateTestCaseFormState({
    defaultNodesOrder,
    defaultFlowBlocks,
    defaultTitle,
    defaultDescription,
    onSubmitAction,
    id,
    push,
  })
  const { nodesOrder, setNodesOrder } = form
  const flow = useMemo(() => flowFromNodeOrder(nodesOrder), [nodesOrder])
  const invocationDefinitions = useMergedStepDefinitionOptions(stepDefinitions, editorDefinitions)
  const publishFlow = useCallback(
    (next: AuthoredFlow) => setNodesOrder(nodeOrderFromFlow(next) as TemplateTestCaseNodeOrderMap),
    [setNodesOrder],
  )
  const invocationController = useFlowInvocationController({
    flow,
    definitions: invocationDefinitions,
    readyDefinitions: stepDefinitions,
    publish: publishFlow,
    flowBlocks: form.flowBlocks,
    onFlowBlocksChange: form.setFlowBlocks,
    nodeKind: 'template-test-case',
  })
  const invocationResources = useStepInvocationResources({ locators, locatorGroups, environments, modules })

  return (
    <div className="flex flex-col gap-4">
      <TemplateTestCaseMetadata
        title={form.title}
        description={form.description}
        errors={form.errors}
        onTitleChange={form.setTitle}
        onDescriptionChange={form.setDescription}
        nodesOrder={form.nodesOrder}
      />
      <div className="mb-4 flex h-[500px] flex-col gap-2">
        <FlowAuthoringViewToggle view={form.authoringView} onChange={form.setAuthoringView} />
        <TemplateTestCaseFlow
          initialNodesOrder={form.nodesOrder}
          stepDefinitions={stepDefinitions}
          onNodeOrderChange={form.setNodesOrder}
          resources={invocationResources}
          defaultValueInput={defaultValueInput}
          flowBlocks={form.flowBlocks}
          onFlowBlocksChange={form.setFlowBlocks}
          invocationController={invocationController}
          view={form.authoringView}
        />
      </div>
      <TemplateTestCaseFormFieldError message={form.errors.steps} />
      <div className="mb-4 flex flex-col gap-2">
        <Button onClick={form.handleSubmit} className="w-fit px-6">
          <Save className="size-4" aria-hidden />
          <span className="font-bold">Save</span>
        </Button>
      </div>
    </div>
  )
}

export default TemplateTestCaseForm
