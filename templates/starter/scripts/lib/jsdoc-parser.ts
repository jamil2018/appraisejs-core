import { TemplateStepGroupType } from '@prisma/client'

export interface StepGroupJSDoc {
  name: string
  description: string | null
  type: TemplateStepGroupType
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

function findTopLevelJSDocStart(lines: string[]): number | null {
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

function readGroupMetadataLine(
  line: string,
  metadata: { name: string | null; description: string | null; type: string | null },
) {
  metadata.name = readJSDocTag(line, 'name') ?? metadata.name
  metadata.description = readJSDocTag(line, 'description') ?? metadata.description
  metadata.type = readJSDocTag(line, 'type') ?? metadata.type
}

function normalizeGroupType(type: string): TemplateStepGroupType {
  const normalizedType = type.toUpperCase()
  if (normalizedType !== 'ACTION' && normalizedType !== 'VALIDATION') {
    throw new Error(`Invalid @type value: ${type}. Must be ACTION or VALIDATION`)
  }

  return normalizedType as TemplateStepGroupType
}

/**
 * Parses JSDoc comment to extract top-of-file step group metadata.
 * Returns null if no valid group JSDoc is found.
 */
export function parseGroupJSDoc(content: string): StepGroupJSDoc | null {
  const lines = content.split('\n')
  const startLine = findTopLevelJSDocStart(lines)
  if (startLine == null) return null

  const metadata = { name: null as string | null, description: null as string | null, type: null as string | null }
  const maxLines = Math.min(lines.length, startLine + 50)
  for (let i = startLine; i < maxLines; i++) {
    const line = lines[i]

    if (line.includes('*/')) {
      const beforeClose = line.split('*/')[0].trim()
      readGroupMetadataLine(beforeClose, metadata)
      return metadata.name && metadata.type
        ? {
            name: metadata.name.trim(),
            description: metadata.description ? metadata.description.trim() : null,
            type: normalizeGroupType(metadata.type),
          }
        : null
    }

    readGroupMetadataLine(line, metadata)
  }

  return null
}
