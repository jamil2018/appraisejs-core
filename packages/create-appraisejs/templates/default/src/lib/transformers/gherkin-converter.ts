import { TemplateStepType } from '@prisma/client'

export const generateGherkinStep = (
  type: TemplateStepType,
  signature: string,
  parameters: { value: string; order: number }[],
) => {
  const signatureParts = signature.split(' ')
  const sortedParameters = parameters.sort((a, b) => a.order - b.order)

  const gherkinStep = signatureParts
    .map(part => {
      // Check if this part is a parameter placeholder
      if (part.startsWith('{') && part.endsWith('}')) {
        const parameter = sortedParameters.shift()

        // If no parameter or missing value, return the placeholder to indicate incompleteness
        if (!parameter || !parameter.value || parameter.value.trim() === '') {
          return part
        }

        // Format the parameter value based on its type
        switch (part) {
          case '{string}':
            return `"${parameter.value}"`
          case '{int}':
            return parameter.value
          case '{boolean}':
            return parameter.value
          default:
            return parameter.value
        }
      }

      return part
    })
    .join(' ')

  // Prepend the appropriate Gherkin keyword based on type
  const keyword = type === 'ACTION' ? 'When' : 'Then'
  return `${keyword} ${gherkinStep}`
}
