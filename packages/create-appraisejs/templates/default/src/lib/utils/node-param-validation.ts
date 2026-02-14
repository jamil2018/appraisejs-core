import { StepParameterType, TemplateStepParameter } from '@prisma/client'

/**
 * Type for node data with parameters needed for validation
 */
type NodeDataForValidation = {
  templateStepId: string
  parameters: {
    name: string
    value: string
    type: StepParameterType
    order: number
  }[]
}

/**
 * Checks if a node has missing mandatory parameters
 * @param nodeData - The node data to validate (must have templateStepId and parameters)
 * @param templateStepParams - All available template step parameters
 * @param defaultValueInput - If true, all parameters are optional (skip validation)
 * @returns true if any mandatory parameter is missing, false otherwise
 */
export function checkMissingMandatoryParams(
  nodeData: NodeDataForValidation,
  templateStepParams: TemplateStepParameter[],
  defaultValueInput: boolean,
): boolean {
  // Skip all validation if defaultValueInput is true (all fields are optional)
  if (defaultValueInput) {
    return false
  }

  // Get all template step parameters for this node's templateStepId
  const nodeParams = templateStepParams.filter(param => param.templateStepId === nodeData.templateStepId)

  // Create a map of node parameters by name for quick lookup
  const nodeParamMap = new Map(nodeData.parameters.map(param => [param.name, param.value]))

  // Check each required parameter
  for (const param of nodeParams) {
    const value = nodeParamMap.get(param.name)

    // LOCATOR: Check if value is empty (we can't check locator group selection from node data)
    if (param.type === 'LOCATOR') {
      if (!value || value.trim() === '') {
        return true
      }
    }

    // STRING: Check if value is empty
    if (param.type === 'STRING') {
      if (!value || value.trim() === '') {
        return true
      }
    }

    // NUMBER: Check if value is empty
    if (param.type === 'NUMBER') {
      if (!value || value.trim() === '') {
        return true
      }
    }

    // DATE: Check if value is empty or invalid
    if (param.type === 'DATE') {
      if (!value || value.trim() === '') {
        return true
      }
      // Try to parse the date to check if it's valid
      const date = new Date(value)
      if (isNaN(date.getTime())) {
        return true
      }
    }

    // BOOLEAN: Always has a value (true/false), so skip validation
    // No validation needed for BOOLEAN type
  }

  return false
}
