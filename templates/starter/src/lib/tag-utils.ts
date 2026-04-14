import { Tag, TagType } from '@prisma/client'

type TagShape = Pick<Tag, 'name' | 'tagExpression' | 'type'>

export function isIdentifierTagName(name: string): boolean {
  return name.startsWith('tc_') || name.startsWith('ts_')
}

export function isIdentifierTagExpression(tagExpression: string): boolean {
  const normalized = tagExpression.startsWith('@') ? tagExpression.slice(1) : tagExpression
  return isIdentifierTagName(normalized)
}

export function getTagTypeFromName(name: string): TagType {
  return isIdentifierTagName(name) ? TagType.IDENTIFIER : TagType.FILTER
}

export function getTagTypeFromExpression(tagExpression: string): TagType {
  return isIdentifierTagExpression(tagExpression) ? TagType.IDENTIFIER : TagType.FILTER
}

export function getIdentifierTagByPrefix<T extends TagShape>(tags: T[], prefix: 'tc_' | 'ts_'): T | undefined {
  return tags.find(tag => tag.type === TagType.IDENTIFIER && tag.name.startsWith(prefix))
}

export function getFilterTags<T extends TagShape>(tags: T[]): T[] {
  return tags.filter(tag => tag.type === TagType.FILTER)
}
