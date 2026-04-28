import { format } from 'date-fns'
import { StepParameterType, type Locator, type TemplateStepParameter } from '@prisma/client'

type DynamicParameterValue = string | number | boolean | Date

type DynamicParameterInput = {
  name: string
  value: string
  type: StepParameterType
  order: number
}

export type DynamicParameterValuesMap = Record<string, DynamicParameterValue>

function getDefaultParameterValue(type: StepParameterType): DynamicParameterValue {
  switch (type) {
    case StepParameterType.NUMBER:
      return 0
    case StepParameterType.STRING:
    case StepParameterType.LOCATOR:
      return ''
    case StepParameterType.DATE:
      return new Date()
    case StepParameterType.BOOLEAN:
      return false
  }
}

function parseInitialParameterValue(type: StepParameterType, value: string): DynamicParameterValue {
  switch (type) {
    case StepParameterType.NUMBER:
      return Number(value)
    case StepParameterType.STRING:
    case StepParameterType.LOCATOR:
      return value
    case StepParameterType.DATE: {
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? new Date() : date
    }
    case StepParameterType.BOOLEAN:
      return value === 'true'
  }
}

export function getDynamicParameterInitialValues(
  templateStepParams: TemplateStepParameter[],
  initialParameterValues?: DynamicParameterInput[],
): DynamicParameterValuesMap {
  const initialValueMap = Object.fromEntries(
    (initialParameterValues ?? []).map(parameter => [parameter.name, parameter]),
  )

  return Object.fromEntries(
    templateStepParams.map(parameter => {
      const initialValue = initialValueMap[parameter.name]
      return [
        parameter.name,
        initialValue
          ? parseInitialParameterValue(parameter.type, initialValue.value)
          : getDefaultParameterValue(parameter.type),
      ]
    }),
  )
}

export function getInitialSelectedLocatorGroups(
  templateStepParams: TemplateStepParameter[],
  initialParameterValues: DynamicParameterInput[] | undefined,
  locators: Array<Pick<Locator, 'id' | 'name' | 'locatorGroupId'>>,
) {
  const initialValueMap = Object.fromEntries((initialParameterValues ?? []).map(parameter => [parameter.name, parameter]))

  return Object.fromEntries(
    templateStepParams.flatMap(parameter => {
      if (parameter.type !== StepParameterType.LOCATOR) {
        return []
      }

      const locatorName = initialValueMap[parameter.name]?.value
      if (!locatorName) {
        return []
      }

      const locator = locators.find(locatorRow => locatorRow.name === locatorName)
      return locator?.locatorGroupId ? [[parameter.name, locator.locatorGroupId]] : []
    }),
  )
}

export function validateDynamicParameters(
  templateStepParams: TemplateStepParameter[],
  values: DynamicParameterValuesMap,
  selectedLocatorGroups: Record<string, string>,
  defaultValueInput: boolean,
  locatorSelectionModes: Record<string, 'existing' | 'new'> = {},
) {
  if (defaultValueInput) {
    return {}
  }

  const errors: Record<string, string> = {}

  templateStepParams.forEach(parameter => {
    const value = values[parameter.name]

    if (parameter.type === StepParameterType.LOCATOR) {
      if (locatorSelectionModes[parameter.name] === 'new') {
        if (!value) {
          errors[parameter.name] = 'Locator is required'
        }
      } else if (!selectedLocatorGroups[parameter.name]) {
        errors[parameter.name] = 'Locator group is required'
      } else if (!value) {
        errors[parameter.name] = 'Locator is required'
      }
      return
    }

    if ((parameter.type === StepParameterType.STRING || parameter.type === StepParameterType.NUMBER) && !value) {
      errors[parameter.name] = 'This field is required'
    }
  })

  return errors
}

export function formatDynamicParameterValues(
  templateStepParams: TemplateStepParameter[],
  values: DynamicParameterValuesMap,
): DynamicParameterInput[] {
  return templateStepParams.map(parameter => {
    const value = values[parameter.name]

    let formattedValue = ''
    switch (parameter.type) {
      case StepParameterType.NUMBER:
        formattedValue = value !== undefined && value !== null ? String(value) : ''
        break
      case StepParameterType.STRING:
      case StepParameterType.LOCATOR:
        formattedValue = value !== undefined && value !== null ? String(value) : ''
        break
      case StepParameterType.DATE:
        formattedValue =
          value instanceof Date && !Number.isNaN(value.getTime()) ? format(value, 'PPP') : ''
        break
      case StepParameterType.BOOLEAN:
        formattedValue = value !== undefined && value !== null ? String(value) : ''
        break
    }

    return {
      name: parameter.name,
      value: formattedValue,
      type: parameter.type,
      order: parameter.order,
    }
  })
}

export function getLocatorsForGroup(locators: Array<Pick<Locator, 'id' | 'name' | 'locatorGroupId'>>, groupId: string) {
  return locators.filter(locator => locator.locatorGroupId === groupId)
}
