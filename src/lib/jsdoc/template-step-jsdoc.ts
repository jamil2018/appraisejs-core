import { TemplateStepGroupType, TemplateStepIcon } from '@prisma/client'

export interface StepGroupJSDoc {
  name: string
  description: string | null
  type: TemplateStepGroupType
}

export interface StepJSDoc {
  name: string
  description: string | null
  icon: TemplateStepIcon
}

export function readJSDocTag(line: string, tagName: string): string | null {
  const trimmed = line.trim()
  const prefix = `@${tagName}`
  const withoutCommentMarker = trimmed.replace(/^\*\s?/, '')

  if (!withoutCommentMarker.startsWith(prefix)) {
    return null
  }

  const value = withoutCommentMarker.slice(prefix.length).trim()
  return value || null
}

export function findTopLevelJSDocStart(lines: string[]): number | null {
  let startLine = 0
  let isInsideImportBlock = false

  while (startLine < lines.length) {
    const line = lines[startLine].trim()

    if (isInsideImportBlock) {
      if (line.includes('from ') || line.endsWith(';')) {
        isInsideImportBlock = false
      }
      startLine++
      continue
    }

    if (line === '') {
      startLine++
      continue
    }

    if (line.startsWith('import ')) {
      isInsideImportBlock = line.includes('{') && !line.includes('from ')
      startLine++
      continue
    }

    break
  }

  return startLine < lines.length && lines[startLine].trim().startsWith('/**') ? startLine : null
}

export function findNearestJSDocStart(lines: string[], startLine: number): number | null {
  for (let i = startLine - 1; i >= 0 && i >= startLine - 20; i--) {
    const line = lines[i]?.trim()

    if (line?.startsWith('/**')) {
      return i
    }

    if (!line?.includes('*/')) {
      continue
    }

    for (let j = i - 1; j >= 0 && j >= i - 10; j--) {
      if (lines[j]?.trim().startsWith('/**')) {
        return j
      }
    }

    return i
  }

  return null
}

function readGroupMetadataLine(
  line: string,
  metadata: { name: string | null; description: string | null; type: string | null },
) {
  metadata.name = readJSDocTag(line, 'name') ?? metadata.name
  metadata.description = readJSDocTag(line, 'description') ?? metadata.description
  metadata.type = readJSDocTag(line, 'type') ?? metadata.type
}

function readStepMetadataLine(
  line: string,
  metadata: { name: string | null; description: string | null; icon: string | null },
) {
  metadata.name = readJSDocTag(line, 'name') ?? metadata.name
  metadata.description = readJSDocTag(line, 'description') ?? metadata.description
  metadata.icon = readJSDocTag(line, 'icon') ?? metadata.icon
}

function normalizeGroupTypeStrict(type: string): TemplateStepGroupType {
  const normalizedType = type.toUpperCase()
  if (normalizedType !== 'ACTION' && normalizedType !== 'VALIDATION') {
    throw new Error(`Invalid @type value: ${type}. Must be ACTION or VALIDATION`)
  }

  return normalizedType as TemplateStepGroupType
}

/**
 * Parses top-of-file group JSDoc. Invalid @type throws (CLI / step registry).
 */
export function parseGroupJSDocStrict(content: string): StepGroupJSDoc | null {
  const lines = content.split('\n')
  const startLine = findTopLevelJSDocStart(lines)
  if (startLine == null) return null

  const metadata = { name: null as string | null, description: null as string | null, type: null as string | null }
  const maxLines = Math.min(lines.length, startLine + 50)
  for (let i = startLine; i < maxLines; i++) {
    const line = lines[i] ?? ''

    if (line.includes('*/')) {
      const beforeClose = line.split('*/')[0].trim()
      readGroupMetadataLine(beforeClose, metadata)
      return metadata.name && metadata.type
        ? {
            name: metadata.name.trim(),
            description: metadata.description ? metadata.description.trim() : null,
            type: normalizeGroupTypeStrict(metadata.type),
          }
        : null
    }

    readGroupMetadataLine(line, metadata)
  }

  return null
}

/**
 * Same shape as strict parsing; unknown @type yields null (sync / DB projection).
 */
export function parseGroupJSDocLenient(content: string): StepGroupJSDoc | null {
  const lines = content.split('\n')
  const startLine = findTopLevelJSDocStart(lines)
  if (startLine == null) return null

  const metadata = { name: null as string | null, description: null as string | null, type: null as string | null }
  const maxLines = Math.min(lines.length, startLine + 50)
  for (let i = startLine; i < maxLines; i++) {
    const line = lines[i] ?? ''

    if (line.includes('*/')) {
      const beforeClose = line.split('*/')[0].trim()
      readGroupMetadataLine(beforeClose, metadata)
      break
    }

    readGroupMetadataLine(line, metadata)
  }

  if (!metadata.name || !metadata.type) {
    return null
  }

  const normalizedType = metadata.type.toUpperCase()
  if (normalizedType !== 'ACTION' && normalizedType !== 'VALIDATION') {
    return null
  }

  return {
    name: metadata.name.trim(),
    description: metadata.description ? metadata.description.trim() : null,
    type: normalizedType as TemplateStepGroupType,
  }
}

/**
 * Nearest step JSDoc before a line. Invalid @icon throws (CLI).
 */
export function parseStepJSDocStrict(content: string, startLine: number): StepJSDoc | null {
  const lines = content.split('\n')
  const jsdocStart = findNearestJSDocStart(lines, startLine)
  if (jsdocStart == null) return null

  const metadata = { name: null as string | null, description: null as string | null, icon: null as string | null }
  for (let i = jsdocStart; i < Math.min(lines.length, jsdocStart + 20); i++) {
    const line = lines[i] ?? ''

    if (line.trim().startsWith('/**')) {
      continue
    }

    if (line.includes('*/')) {
      const beforeClose = line.split('*/')[0].trim()
      readStepMetadataLine(beforeClose, metadata)
      break
    }

    readStepMetadataLine(line, metadata)
  }

  if (!metadata.name || !metadata.icon) {
    return null
  }

  const iconUpper = metadata.icon.toUpperCase()
  const validIcons = Object.values(TemplateStepIcon)
  if (!validIcons.includes(iconUpper as TemplateStepIcon)) {
    throw new Error(`Invalid @icon value: ${metadata.icon}. Must be one of: ${validIcons.join(', ')}`)
  }

  return {
    name: metadata.name.trim(),
    description: metadata.description ? metadata.description.trim() : null,
    icon: iconUpper as TemplateStepIcon,
  }
}

/**
 * Invalid @icon yields null (filesystem sync).
 */
export function parseStepJSDocLenient(content: string, startLine: number): StepJSDoc | null {
  const lines = content.split('\n')
  const jsdocStart = findNearestJSDocStart(lines, startLine)
  if (jsdocStart == null) return null

  const metadata = { name: null as string | null, description: null as string | null, icon: null as string | null }
  for (let i = jsdocStart; i < Math.min(lines.length, jsdocStart + 20); i++) {
    const line = lines[i] ?? ''

    if (line.trim().startsWith('/**')) {
      continue
    }

    if (line.includes('*/')) {
      const beforeClose = line.split('*/')[0].trim()
      readStepMetadataLine(beforeClose, metadata)
      break
    }

    readStepMetadataLine(line, metadata)
  }

  if (!metadata.name || !metadata.icon) {
    return null
  }

  const iconUpper = metadata.icon.toUpperCase()
  const validIcons = Object.values(TemplateStepIcon)
  if (!validIcons.includes(iconUpper as TemplateStepIcon)) {
    return null
  }

  return {
    name: metadata.name.trim(),
    description: metadata.description ? metadata.description.trim() : null,
    icon: iconUpper as TemplateStepIcon,
  }
}
