import { formatTemplateList, parseTemplateId, type TemplateId } from './template-catalog.js'

export interface CliOptions {
  template?: TemplateId
}

function getTemplateFlagValue(argument: string, argv: string[], index: number): string | null {
  if (argument === '--template') {
    return argv[index + 1] ?? null
  }

  if (argument.startsWith('--template=')) {
    return argument.slice('--template='.length)
  }

  return null
}

export function parseCliArgs(argv: string[]): CliOptions {
  let template: TemplateId | undefined

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    const templateValue = getTemplateFlagValue(argument, argv, index)

    if (templateValue === null) {
      continue
    }

    if (!templateValue.trim()) {
      throw new Error(`Missing value for --template. Expected one of: ${formatTemplateList()}.`)
    }

    const parsedTemplate = parseTemplateId(templateValue)
    if (!parsedTemplate) {
      throw new Error(`Invalid template "${templateValue}". Expected one of: ${formatTemplateList()}.`)
    }

    template = parsedTemplate

    if (argument === '--template') {
      index++
    }
  }

  return { template }
}
