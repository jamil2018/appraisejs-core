'use client'

import { useState, useMemo, useImperativeHandle, useEffect, useRef, startTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StepParameterType, TemplateStepParameter, type Module } from '@prisma/client'
import type {
  InlineLocatorSaveResult,
  LocatorWorkspaceEnvironment,
} from '@/app/(base)/locators/create/create-locator-workspace-helpers'
import {
  formatDynamicParameterValues,
  getDynamicParameterInitialValues,
  getInitialSelectedLocatorGroups,
  validateDynamicParameters,
} from './dynamic-parameters-helpers'
import { DynamicParameterInputField } from './dynamic-parameter-fields'
import type {
  DynamicParameterValue,
  LocatorOption,
  LocatorGroupOption,
  LocatorSelectionMode,
} from './dynamic-parameter-field-types'

type DynamicFieldState = {
  values: Record<string, DynamicParameterValue>
  selectedLocatorGroups: Record<string, string>
  createdLocatorSelections: Record<string, InlineLocatorSaveResult>
  locatorSelectionModes: Record<string, LocatorSelectionMode>
}

function createFieldState(
  values: Record<string, DynamicParameterValue>,
  selectedLocatorGroups: Record<string, string>,
): DynamicFieldState {
  return {
    values,
    selectedLocatorGroups,
    createdLocatorSelections: {},
    locatorSelectionModes: {},
  }
}

type DynamicFormFieldsProps = {
  templateStepParams: TemplateStepParameter[]
  locators: LocatorOption[]
  locatorGroups: LocatorGroupOption[]
  environments: LocatorWorkspaceEnvironment[]
  modules: Array<Pick<Module, 'id' | 'name' | 'parentId'>>
  onLocatorCreated?: (result: InlineLocatorSaveResult) => void
  defaultValueInput?: boolean
  onChange?: (
    values: {
      name: string
      value: string
      type: StepParameterType
      order: number
    }[],
  ) => void
  initialParameterValues?: {
    name: string
    value: string
    type: StepParameterType
    order: number
  }[]
}

export interface DynamicFormFieldsRef {
  validate: () => boolean
}

function DynamicFormFields({
  ref,
  templateStepParams,
  locators,
  locatorGroups,
  environments,
  modules,
  onLocatorCreated,
  defaultValueInput = false,
  onChange,
  initialParameterValues,
}: DynamicFormFieldsProps & React.RefAttributes<DynamicFormFieldsRef>) {
  const resetKey = useMemo(() => {
    return JSON.stringify({
      params: templateStepParams.map(p => ({ name: p.name, type: p.type })),
      initialParameterValues,
    })
  }, [templateStepParams, initialParameterValues])

  // Create initial values only once when component mounts
  const initialValues = useMemo(
    () => getDynamicParameterInitialValues(templateStepParams, initialParameterValues),
    [templateStepParams, initialParameterValues],
  )

  // Derive initial locator groups from initialParameterValues (locator name -> group id via locators lookup)
  const initialSelectedLocatorGroups = useMemo(
    () => getInitialSelectedLocatorGroups(templateStepParams, initialParameterValues, locators),
    [templateStepParams, initialParameterValues, locators],
  )

  const [fieldState, setFieldState] = useState<DynamicFieldState>(() =>
    createFieldState(initialValues, initialSelectedLocatorGroups),
  )
  const { values, selectedLocatorGroups, createdLocatorSelections, locatorSelectionModes } = fieldState
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [inlineLocators, setInlineLocators] = useState<LocatorOption[]>([])
  const [inlineLocatorGroups, setInlineLocatorGroups] = useState<LocatorGroupOption[]>([])
  const [createLocatorParamName, setCreateLocatorParamName] = useState<string | null>(null)
  const lastInitialSyncKeyRef = useRef<string | null>(null)
  const fieldClassName = 'w-full border-border bg-background'

  const availableLocatorGroups = useMemo(() => {
    const groupsById = new Map<string, LocatorGroupOption>()
    for (const group of locatorGroups) {
      groupsById.set(group.id, group)
    }
    for (const group of inlineLocatorGroups) {
      groupsById.set(group.id, group)
    }
    return Array.from(groupsById.values())
  }, [inlineLocatorGroups, locatorGroups])

  const availableLocatorOptions = useMemo(() => {
    const locatorsById = new Map<string, LocatorOption>()
    for (const locator of locators) {
      locatorsById.set(locator.id, locator)
    }
    for (const locator of inlineLocators) {
      locatorsById.set(locator.id, locator)
    }
    return Array.from(locatorsById.values())
  }, [inlineLocators, locators])

  useEffect(() => {
    startTransition(() => {
      setErrors({})
    })
  }, [templateStepParams])

  // Sync state when initial data changes (e.g. opening edit for a different node)
  useEffect(() => {
    if (lastInitialSyncKeyRef.current === resetKey) {
      return
    }

    lastInitialSyncKeyRef.current = resetKey
    startTransition(() => {
      setFieldState(createFieldState(initialValues, initialSelectedLocatorGroups))
    })
  }, [initialValues, initialSelectedLocatorGroups, resetKey])

  useImperativeHandle(ref, () => ({
    validate: () => {
      const newErrors = validateDynamicParameters(
        templateStepParams,
        values,
        selectedLocatorGroups,
        defaultValueInput,
        locatorSelectionModes,
      )
      setErrors(newErrors)
      return Object.keys(newErrors).length === 0
    },
  }))

  // Update values when an input changes
  const handleInputChange = (name: string, value: string | number | boolean | Date) => {
    const newValues: Record<string, DynamicParameterValue> = {
      ...values,
      [name]: value,
    }

    setFieldState(prev => ({ ...prev, values: newValues }))

    // Clear error for the field being edited
    if (errors[name]) {
      const newErrors = { ...errors }
      delete newErrors[name]
      setErrors(newErrors)
    }

    // Notify parent component of changes
    if (onChange) {
      onChange(formatDynamicParameterValues(templateStepParams, newValues))
    }
  }

  // Handle locator group selection
  const handleLocatorGroupChange = (paramName: string, groupId: string) => {
    setFieldState(prev => ({
      ...prev,
      selectedLocatorGroups: {
        ...prev.selectedLocatorGroups,
        [paramName]: groupId,
      },
      values: {
        ...prev.values,
        [paramName]: '',
      },
    }))

    // Clear errors for this field
    if (errors[paramName]) {
      const newErrors = { ...errors }
      delete newErrors[paramName]
      setErrors(newErrors)
    }
  }

  const handleLocatorSelectionModeChange = (paramName: string, mode: LocatorSelectionMode) => {
    if (mode === 'new') {
      const createdLocatorSelection = createdLocatorSelections[paramName]
      if (createdLocatorSelection) {
        const newValues: Record<string, DynamicParameterValue> = {
          ...values,
          [paramName]: createdLocatorSelection.locatorName,
        }
        setFieldState(prev => ({
          ...prev,
          locatorSelectionModes: {
            ...prev.locatorSelectionModes,
            [paramName]: mode,
          },
          selectedLocatorGroups: {
            ...prev.selectedLocatorGroups,
            [paramName]: createdLocatorSelection.locatorGroupId,
          },
          values: newValues,
        }))
        onChange?.(formatDynamicParameterValues(templateStepParams, newValues))
        if (errors[paramName]) {
          const newErrors = { ...errors }
          delete newErrors[paramName]
          setErrors(newErrors)
        }
        return
      }
    }

    setFieldState(prev => ({
      ...prev,
      locatorSelectionModes: {
        ...prev.locatorSelectionModes,
        [paramName]: mode,
      },
    }))

    if (errors[paramName]) {
      const newErrors = { ...errors }
      delete newErrors[paramName]
      setErrors(newErrors)
    }
  }

  const handleInlineLocatorSave = (paramName: string, result: InlineLocatorSaveResult) => {
    const nextGroup = {
      id: result.locatorGroupId,
      name: result.locatorGroupName,
      route: result.route,
      moduleId: result.moduleId,
    }
    const nextLocator = {
      id: result.locatorId,
      name: result.locatorName,
      locatorGroupId: result.locatorGroupId,
    }

    setInlineLocatorGroups(current =>
      current.some(group => group.id === nextGroup.id)
        ? current.map(group => (group.id === nextGroup.id ? nextGroup : group))
        : [...current, nextGroup],
    )
    setInlineLocators(current =>
      current.some(locator => locator.id === nextLocator.id)
        ? current.map(locator => (locator.id === nextLocator.id ? nextLocator : locator))
        : [...current, nextLocator],
    )
    const newValues: Record<string, DynamicParameterValue> = {
      ...values,
      [paramName]: result.locatorName,
    }

    setFieldState(prev => ({
      ...prev,
      createdLocatorSelections: {
        ...prev.createdLocatorSelections,
        [paramName]: result,
      },
      selectedLocatorGroups: {
        ...prev.selectedLocatorGroups,
        [paramName]: result.locatorGroupId,
      },
      values: newValues,
    }))

    if (errors[paramName]) {
      const newErrors = { ...errors }
      delete newErrors[paramName]
      setErrors(newErrors)
    }

    onChange?.(formatDynamicParameterValues(templateStepParams, newValues))
    onLocatorCreated?.(result)
  }

  // Guard: do not render if no parameters
  if (!templateStepParams || templateStepParams.length === 0) {
    return null
  }

  return (
    <Card className="border-zinc-700 bg-transparent shadow-none" key={resetKey}>
      <CardHeader className="py-3">
        <CardTitle className="text-xs font-bold text-primary">Parameters</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {templateStepParams.map(param => (
            <div key={param.name}>
              <DynamicParameterInputField
                param={param}
                values={values}
                errors={errors}
                defaultValueInput={defaultValueInput}
                fieldClassName={fieldClassName}
                selectedLocatorGroups={selectedLocatorGroups}
                locatorSelectionModes={locatorSelectionModes}
                createdLocatorSelections={createdLocatorSelections}
                availableLocatorGroups={availableLocatorGroups}
                availableLocatorOptions={availableLocatorOptions}
                createLocatorParamName={createLocatorParamName}
                environments={environments}
                modules={modules}
                onInputChange={handleInputChange}
                onLocatorGroupChange={handleLocatorGroupChange}
                onLocatorSelectionModeChange={handleLocatorSelectionModeChange}
                onInlineLocatorSave={handleInlineLocatorSave}
                onOpenCreateLocator={setCreateLocatorParamName}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

DynamicFormFields.displayName = 'DynamicFormFields'
export default DynamicFormFields
