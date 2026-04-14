import { TemplateStepGroupType } from '@prisma/client'

export interface StepGroupJSDoc {
  name: string
  description: string | null
  type: TemplateStepGroupType
}

/**
 * Parses JSDoc comment to extract top-of-file step group metadata.
 * Returns null if no valid group JSDoc is found.
 */
export function parseGroupJSDoc(content: string): StepGroupJSDoc | null {
  const lines = content.split('\n')

  if (lines.length === 0) {
    return null
  }

  let startLine = 0
  while (startLine < lines.length) {
    const line = lines[startLine].trim()
    if (line === '' || line.startsWith('import ')) {
      startLine++
      continue
    }
    break
  }

  if (startLine >= lines.length || !lines[startLine].trim().startsWith('/**')) {
    return null
  }

  let hasType = false
  let endLine = -1
  let name: string | null = null
  let description: string | null = null
  let type: string | null = null

  const maxLines = Math.min(lines.length, startLine + 50)
  for (let i = startLine; i < maxLines; i++) {
    const line = lines[i].trim()

    if (line.includes('*/')) {
      const beforeClose = line.split('*/')[0].trim()

      if (beforeClose.startsWith('* @name') || beforeClose.startsWith('*@name')) {
        const match = beforeClose.match(/@name\s+(.+)/)
        if (match) name = match[1].trim()
      } else if (beforeClose.startsWith('* @description') || beforeClose.startsWith('*@description')) {
        const match = beforeClose.match(/@description\s+(.+)/)
        if (match) description = match[1].trim() || null
      } else if (beforeClose.startsWith('* @type') || beforeClose.startsWith('*@type')) {
        hasType = true
        const match = beforeClose.match(/@type\s+(.+)/)
        if (match) type = match[1].trim()
      }

      endLine = i
      break
    } else if (line.startsWith('* @name') || line.startsWith('*@name')) {
      const match = line.match(/@name\s+(.+)/)
      if (match) name = match[1].trim()
    } else if (line.startsWith('* @description') || line.startsWith('*@description')) {
      const match = line.match(/@description\s+(.+)/)
      if (match) description = match[1].trim() || null
    } else if (line.startsWith('* @type') || line.startsWith('*@type')) {
      hasType = true
      const match = line.match(/@type\s+(.+)/)
      if (match) type = match[1].trim()
    }
  }

  if (hasType && endLine >= 0 && name && type) {
    const normalizedType = type.toUpperCase()
    if (normalizedType !== 'ACTION' && normalizedType !== 'VALIDATION') {
      throw new Error(`Invalid @type value: ${type}. Must be ACTION or VALIDATION`)
    }

    return {
      name: name.trim(),
      description: description ? description.trim() : null,
      type: normalizedType as TemplateStepGroupType,
    }
  }

  return null
}
