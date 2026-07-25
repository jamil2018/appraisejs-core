'use client'

import type { Environment, Locator, LocatorGroup, Module } from '@prisma/client'
import { Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import FlowDiagram from '@/components/diagram/flow-diagram'
import ErrorMessage from '@/components/form/error-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { stepBlockSchema, type StepBlockFormValues } from '@/constants/form-opts/step-block-form-opts'
import { toast } from '@/hooks/use-toast'
import type { NodeOrderMap, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'
import type { StepDefinitionOption } from '@/types/step-definition-option'

import { getActionErrorMessage, getStepBlockNodeOrder, type StepBlockFormSubmitAction } from './step-block-helpers'

type StepBlockFormProps = {
  defaultValues?: StepBlockFormValues
  stepDefinitions: StepDefinitionOption[]
  successTitle: string
  successMessage: string
  id?: string
  onSubmitAction: StepBlockFormSubmitAction
}

type StepBlockErrors = Record<string, string | undefined>

const EMPTY_LOCATORS: Array<Pick<Locator, 'id' | 'name' | 'locatorGroupId'>> = []
const EMPTY_LOCATOR_GROUPS: Array<Pick<LocatorGroup, 'id' | 'name' | 'route' | 'moduleId'>> = []
const EMPTY_ENVIRONMENTS: Array<Pick<Environment, 'id' | 'name'>> = []
const EMPTY_MODULES: Array<Pick<Module, 'id' | 'name' | 'parentId'>> = []

function getFieldErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message === '[object Object]' ? 'Invalid value' : message
}

function getOrderedInvocations(nodesOrder: NodeOrderMap) {
  return Object.values(nodesOrder)
    .sort((left, right) => {
      const leftOrder = left.order === -1 ? Number.MAX_SAFE_INTEGER : left.order
      const rightOrder = right.order === -1 ? Number.MAX_SAFE_INTEGER : right.order
      return leftOrder - rightOrder
    })
    .map(node => node.invocation)
}

function getSubmitValue(values: {
  name: string
  intent: string
  description: string
  nodesOrder: NodeOrderMap
}): StepBlockFormValues {
  return {
    name: values.name,
    intent: values.intent,
    description: values.description,
    steps: getOrderedInvocations(values.nodesOrder).map(invocation => ({ invocation })),
  }
}

function getValidationErrors(result: ReturnType<typeof stepBlockSchema.safeParse>): StepBlockErrors {
  if (result.success) {
    return {}
  }

  const fieldErrors = result.error.flatten().fieldErrors
  return {
    name: fieldErrors.name?.map(getFieldErrorMessage)[0],
    intent: fieldErrors.intent?.map(getFieldErrorMessage)[0],
    description: fieldErrors.description?.map(getFieldErrorMessage)[0],
    steps: fieldErrors.steps?.map(getFieldErrorMessage)[0],
  }
}

function StepBlockFieldError({ message }: { message?: string }) {
  return <ErrorMessage message={message ?? ''} visible={Boolean(message)} />
}

function normalizeInitialText(value: string | undefined) {
  return value ?? ''
}

function getInitialMetadataValues(defaultValues: StepBlockFormValues | undefined) {
  return {
    name: normalizeInitialText(defaultValues?.name),
    intent: normalizeInitialText(defaultValues?.intent),
    description: normalizeInitialText(defaultValues?.description),
  }
}

function isSaveDisabled(stepDefinitions: StepDefinitionOption[]) {
  return stepDefinitions.length === 0
}

function isNodeOrderMap(nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap): nodeOrder is NodeOrderMap {
  return Object.values(nodeOrder).every(node =>
    node.parameters.every(
      (
        parameter:
          NodeOrderMap[string]['parameters'][number] | TemplateTestCaseNodeOrderMap[string]['parameters'][number],
      ) => 'value' in parameter,
    ),
  )
}

type StepBlockMetadataFieldsProps = {
  name: string
  intent: string
  description: string
  errors: StepBlockErrors
  onNameChange: (value: string) => void
  onIntentChange: (value: string) => void
  onDescriptionChange: (value: string) => void
}

function StepBlockMetadataFields({
  name,
  intent,
  description,
  errors,
  onNameChange,
  onIntentChange,
  onDescriptionChange,
}: StepBlockMetadataFieldsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={event => onNameChange(event.target.value)} />
        <StepBlockFieldError message={errors.name} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="intent">Intent</Label>
        <Input id="intent" value={intent} onChange={event => onIntentChange(event.target.value)} />
        <StepBlockFieldError message={errors.intent} />
      </div>
      <div className="flex flex-col gap-2 lg:col-span-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" value={description} onChange={event => onDescriptionChange(event.target.value)} />
        <StepBlockFieldError message={errors.description} />
      </div>
    </div>
  )
}

type StepBlockFlowGraphProps = {
  nodesOrder: NodeOrderMap
  stepDefinitions: StepDefinitionOption[]
  onNodeOrderChange: (nodesOrder: NodeOrderMap) => void
}

function StepBlockFlowGraph({ nodesOrder, stepDefinitions, onNodeOrderChange }: StepBlockFlowGraphProps) {
  return (
    <div className="h-[max(22rem,calc(100dvh-18rem))] min-h-[22rem] overflow-hidden rounded-md border border-white/[0.1] bg-[rgba(18,37,64,0.28)]">
      <FlowDiagram
        nodeOrder={nodesOrder}
        stepDefinitions={stepDefinitions}
        locators={EMPTY_LOCATORS}
        locatorGroups={EMPTY_LOCATOR_GROUPS}
        environments={EMPTY_ENVIRONMENTS}
        modules={EMPTY_MODULES}
        parameterMode="hidden"
        onNodeOrderChange={nodeOrder => {
          if (isNodeOrderMap(nodeOrder)) {
            onNodeOrderChange(nodeOrder)
          }
        }}
      />
    </div>
  )
}

async function submitStepBlockForm({
  value,
  id,
  successTitle,
  successMessage,
  onSubmitAction,
  push,
  setErrors,
}: {
  value: StepBlockFormValues
  id?: string
  successTitle: string
  successMessage: string
  onSubmitAction: StepBlockFormSubmitAction
  push: (path: string) => void
  setErrors: (errors: StepBlockErrors) => void
}) {
  const result = stepBlockSchema.safeParse(value)
  const validationErrors = getValidationErrors(result)
  setErrors(validationErrors)

  if (!result.success) {
    return
  }

  const res = await onSubmitAction(undefined, result.data, id)
  if (res.status === 200) {
    toast({ title: successTitle, description: successMessage })
    push('/step-blocks')
    return
  }

  toast({
    title: 'Error',
    description: getActionErrorMessage(res),
    variant: 'destructive',
  })
}

export function StepBlockForm({
  defaultValues,
  stepDefinitions,
  successTitle,
  successMessage,
  id,
  onSubmitAction,
}: StepBlockFormProps) {
  const { push } = useRouter()
  const initialMetadataValues = getInitialMetadataValues(defaultValues)
  const [name, setName] = useState(initialMetadataValues.name)
  const [intent, setIntent] = useState(initialMetadataValues.intent)
  const [description, setDescription] = useState(initialMetadataValues.description)
  const [nodesOrder, setNodesOrder] = useState<NodeOrderMap>(() =>
    getStepBlockNodeOrder(defaultValues, stepDefinitions),
  )
  const [errors, setErrors] = useState<StepBlockErrors>({})

  const handleSubmit = async () => {
    await submitStepBlockForm({
      value: getSubmitValue({ name, intent, description, nodesOrder }),
      id,
      successTitle,
      successMessage,
      onSubmitAction,
      push,
      setErrors,
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <StepBlockMetadataFields
        name={name}
        intent={intent}
        description={description}
        errors={errors}
        onNameChange={setName}
        onIntentChange={setIntent}
        onDescriptionChange={setDescription}
      />

      <StepBlockFlowGraph nodesOrder={nodesOrder} stepDefinitions={stepDefinitions} onNodeOrderChange={setNodesOrder} />
      <StepBlockFieldError message={errors.steps} />

      <Button type="button" className="w-fit px-6" disabled={isSaveDisabled(stepDefinitions)} onClick={handleSubmit}>
        <Save className="size-4" aria-hidden />
        <span className="font-bold">Save</span>
      </Button>
    </div>
  )
}
