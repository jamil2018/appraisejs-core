import { Tag, TagType } from '@prisma/client'

type TagShape = Pick<Tag, 'name' | 'tagExpression' | 'type'>

export function canonicalTagName(value: string): string {
  return value.startsWith('@') ? value.slice(1) : value
}

export function canonicalTagExpression(value: string): string {
  return `@${canonicalTagName(value)}`
}

export function getIdentifierTagByPrefix<T extends TagShape>(tags: T[], prefix: 'tc_' | 'ts_'): T | undefined {
  return tags.find(
    tag =>
      tag.type === TagType.IDENTIFIER &&
      (canonicalTagName(tag.name).startsWith(prefix) || canonicalTagName(tag.tagExpression).startsWith(prefix)),
  )
}

export function getFilterTags<T extends TagShape>(tags: T[]): T[] {
  return tags.filter(tag => tag.type === TagType.FILTER)
}
