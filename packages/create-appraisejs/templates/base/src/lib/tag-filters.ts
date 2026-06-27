import { Tag, TagType } from '@prisma/client'

type TagShape = Pick<Tag, 'name' | 'tagExpression' | 'type'>

export function getIdentifierTagByPrefix<T extends TagShape>(tags: T[], prefix: 'tc_' | 'ts_'): T | undefined {
  return tags.find(tag => tag.type === TagType.IDENTIFIER && tag.name.startsWith(prefix))
}

export function getFilterTags<T extends TagShape>(tags: T[]): T[] {
  return tags.filter(tag => tag.type === TagType.FILTER)
}
