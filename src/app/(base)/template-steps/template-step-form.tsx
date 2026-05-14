'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { templateStepFormOpts, type TemplateStep } from '@/constants/form-opts/template-test-step-form-opts'
import { toast } from '@/hooks/use-toast'
import { TemplateStepType } from '@prisma/client'
import { useForm } from '@tanstack/react-form'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { langs } from '@uiw/codemirror-extensions-langs'
import { githubDark } from '@uiw/codemirror-theme-github'
import { useMemo, useState } from 'react'
import ParamChip from './paramChip'
import { useRouter } from 'next/navigation'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircleIcon, Save } from 'lucide-react'

import {
  buildFunctionDefinitionPreview,
  getActionErrorMessage,
  getFieldErrorMessage,
  getInitialFunctionDefinition,
  getTemplateStepFormDefaults,
  getTemplateStepIconOptions,
  getTemplateStepParameterTypes,
  getTemplateStepTypeOptions,
  templateStepFieldValidators,
  type TemplateStepFormSubmitAction,
} from './template-step-helpers'

export const TemplateStepForm = ({
  defaultValues,
  successTitle,
  successMessage,
  id,
  onSubmitAction,
  templateStepGroups,
}: {
  defaultValues?: TemplateStep
  successTitle: string
  successMessage: string
  id?: string
  onSubmitAction: TemplateStepFormSubmitAction
  templateStepGroups: Array<{ id: string; name: string }>
}) => {
  const { push } = useRouter()
  const initialState = getTemplateStepFormDefaults(defaultValues)
  const [signature, setSignature] = useState(initialState.signature)
  const [baseFunctionDefinition, setBaseFunctionDefinition] = useState(initialState.functionDefinition)
  const [type, setType] = useState<TemplateStepType>(initialState.type)
  const [params, setParams] = useState<TemplateStep['params']>(initialState.params)
  const functionDefinition = useMemo(
    () => buildFunctionDefinitionPreview(baseFunctionDefinition, signature, type, params),
    [baseFunctionDefinition, params, signature, type],
  )

  const form = useForm({
    defaultValues: defaultValues ?? templateStepFormOpts.defaultValues,
    validators: templateStepFormOpts.validators,
    onSubmit: async ({ value }) => {
      value.functionDefinition = functionDefinition
      const res = await onSubmitAction(undefined, value, id)
      if (res.status === 200) {
        toast({
          title: successTitle,
          description: successMessage,
        })
        setSignature('')
        setBaseFunctionDefinition(getInitialFunctionDefinition())
        setType(TemplateStepType.ACTION)
        setParams([])
        push(`/template-steps`)
      }
      if (res.status === 400) {
        toast({
          title: 'Error',
          description: getActionErrorMessage(res),
          variant: 'destructive',
        })
      }
      if (res.status === 500) {
        toast({
          title: 'Error',
          description: getActionErrorMessage(res),
          variant: 'destructive',
        })
      }
    },
  })

  const renderError = (error: unknown) => (
    <p key={getFieldErrorMessage(error)} className="text-xs text-pink-500">
      {getFieldErrorMessage(error)}
    </p>
  )
  const iconOptions = getTemplateStepIconOptions()
  const typeOptions = getTemplateStepTypeOptions()
  const parameterTypes = getTemplateStepParameterTypes()

  return (
    <>
      <Alert variant="destructive" className="mb-4 max-w-fit">
        <AlertCircleIcon />
        <AlertTitle className="text-xl font-bold">
          Please take precaution before updating function signature or parameters.
        </AlertTitle>
        <AlertDescription className="text-xs">
          <p>
            If you update the function signature or parameters, the function body will be updated in the file
            automatically and your changes will be lost.
          </p>
        </AlertDescription>
      </Alert>
      <form
        onSubmit={e => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
      >
        <div className="flex gap-4">
          <Card className="w-full bg-zinc-500/10">
            <CardHeader>
              <CardTitle>Template Step Details</CardTitle>
              <CardDescription>Configure your template step function details</CardDescription>
            </CardHeader>
            <CardContent>
              <form.Field
                name="name"
                validators={{
                  onChange: templateStepFieldValidators.name,
                }}
              >
                {field => {
                  return (
                    <div className="mb-4 flex flex-col gap-2">
                      <Label htmlFor={field.name}>Name</Label>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onChange={e => field.handleChange(e.target.value)}
                      />
                      {field.state.meta.errors.map(renderError)}
                    </div>
                  )
                }}
              </form.Field>
              <form.Field name="description">
                {field => {
                  return (
                    <div className="mb-4 flex flex-col gap-2">
                      <Label htmlFor={field.name}>Description</Label>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onChange={e => field.handleChange(e.target.value)}
                      />
                      {field.state.meta.errors.map(renderError)}
                    </div>
                  )
                }}
              </form.Field>
              <form.Field name="icon">
                {field => {
                  return (
                    <div className="mb-4 flex flex-col gap-2">
                      <Label htmlFor={field.name}>Icon</Label>
                      <Select
                        onValueChange={value => {
                          field.handleChange(value)
                        }}
                        value={field.state.value}
                      >
                        <SelectTrigger id={field.name}>
                          <SelectValue placeholder="Select an icon" />
                        </SelectTrigger>
                        <SelectContent>
                          {iconOptions.map(icon => (
                            <SelectItem key={icon} value={icon}>
                              {icon}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )
                }}
              </form.Field>
              <form.Field
                name="templateStepGroupId"
                validators={{
                  onChange: templateStepFieldValidators.templateStepGroupId,
                }}
              >
                {field => {
                  return (
                    <div className="mb-4 flex flex-col gap-2">
                      <Label htmlFor={field.name}>Template Step Group</Label>
                      <Select
                        onValueChange={value => {
                          field.handleChange(value)
                        }}
                        value={field.state.value}
                      >
                        <SelectTrigger id={field.name}>
                          <SelectValue placeholder="Select a template step group" />
                        </SelectTrigger>
                        <SelectContent isEmpty={!templateStepGroups?.length}>
                          {templateStepGroups?.map(group => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {field.state.meta.errors.map(renderError)}
                    </div>
                  )
                }}
              </form.Field>
              <form.Field
                name="type"
                validators={{
                  onChange: templateStepFieldValidators.type,
                }}
              >
                {field => {
                  return (
                    <div className="mb-4 flex flex-col gap-2">
                      <Label htmlFor={field.name}>Type</Label>
                      <Select
                        onValueChange={value => {
                          field.handleChange(value)
                          setType(value as TemplateStepType)
                        }}
                        value={field.state.value}
                      >
                        <SelectTrigger id={field.name}>
                          <SelectValue placeholder="Select a type" />
                        </SelectTrigger>
                        <SelectContent>
                          {typeOptions.map(typeOption => (
                            <SelectItem key={typeOption} value={typeOption}>
                              {typeOption}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {field.state.meta.errors.map(renderError)}
                    </div>
                  )
                }}
              </form.Field>
              <form.Field
                name="signature"
                validators={{
                  onChange: templateStepFieldValidators.signature,
                }}
              >
                {field => {
                  return (
                    <div className="mb-4 flex flex-col gap-2">
                      <Label htmlFor={field.name}>Signature</Label>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={signature}
                        onChange={e => {
                          field.handleChange(e.target.value)
                          setSignature(e.target.value)
                        }}
                      />
                      {field.state.meta.errors.map(renderError)}
                    </div>
                  )
                }}
              </form.Field>
              <form.Field name="params">
                {field => {
                  return (
                    <div className="mb-4 flex flex-col gap-2">
                      <Label htmlFor={field.name}>Parameters</Label>
                      <ParamChip
                        defaultValues={params}
                        types={parameterTypes}
                        onSubmit={value => {
                          field.handleChange(value)
                          setParams(value)
                        }}
                      />
                    </div>
                  )
                }}
              </form.Field>
              <form.Subscribe selector={formState => [formState.canSubmit, formState.isSubmitting]}>
                {([canSubmit, isSubmitting]) => (
                  <Button type="submit" disabled={!canSubmit}>
                    <Save className="size-4" />
                    {isSubmitting ? '...' : 'Save'}
                  </Button>
                )}
              </form.Subscribe>
            </CardContent>
          </Card>
          <div className="w-full">
            <Card className="bg-zinc-500/10">
              <CardHeader>
                <CardTitle>Template Step Function Definition (Preview)</CardTitle>
                <CardDescription>
                  Preview of your template step function definition that will be generated
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form.Field name="functionDefinition">
                  {field => {
                    return (
                      <div className="mb-4 flex w-full flex-col gap-2">
                        <CodeMirror
                          editable={false}
                          value={functionDefinition}
                          onChange={value => field.handleChange(value)}
                          height="200px"
                          extensions={[langs.ts(), EditorView.lineWrapping]}
                          theme={githubDark}
                        />
                      </div>
                    )
                  }}
                </form.Field>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </>
  )
}
