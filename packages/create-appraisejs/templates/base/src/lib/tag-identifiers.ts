import { TagType } from '@prisma/client'

function isIdentifierTagName(name: string): boolean {
  return name.startsWith('tc_') || name.startsWith('ts_')
}

function isIdentifierTagExpression(tagExpression: string): boolean {
  const normalized = tagExpression.startsWith('@') ? tagExpression.slice(1) : tagExpression
  return isIdentifierTagName(normalized)
}

export function getTagTypeFromName(name: string): TagType {
  return isIdentifierTagName(name) ? TagType.IDENTIFIER : TagType.FILTER
}

export function getTagTypeFromExpression(tagExpression: string): TagType {
  return isIdentifierTagExpression(tagExpression) ? TagType.IDENTIFIER : TagType.FILTER
}
