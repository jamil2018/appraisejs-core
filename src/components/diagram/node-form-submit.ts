import type { RefObject } from 'react'

import type { NodeFormData } from '@/constants/form-opts/diagram/node-form'

import type { DynamicFormFieldsRef } from './dynamic-parameters'
import { buildNodeFormSubmitValue, validateNodeFormValues, type NodeFormErrors } from './node-form-helpers'

type HandleNodeFormSubmitOptions = {
  dynamicFormRef: RefObject<DynamicFormFieldsRef | null>
  selectedTemplateId: string
  parameters: NodeFormData['parameters']
  gherkinStep: string
  onSubmitAction: (values: NodeFormData) => void
  setErrors: (errors: NodeFormErrors) => void
}

export function handleNodeFormSubmit(event: React.FormEvent<HTMLFormElement>, options: HandleNodeFormSubmitOptions) {
  event.preventDefault()

  const isDynamicFormValid = options.dynamicFormRef.current?.validate()
  const formData = new FormData(event.currentTarget)
  const formValues = Object.fromEntries(formData.entries())
  const parsed = validateNodeFormValues(formValues.label, options.selectedTemplateId)

  if (!parsed.success || !isDynamicFormValid) {
    if (!parsed.success) {
      options.setErrors(parsed.error.flatten().fieldErrors)
    }
    return
  }

  options.setErrors({})
  options.onSubmitAction(
    buildNodeFormSubmitValue(formValues, options.parameters, options.gherkinStep, options.selectedTemplateId),
  )
}
