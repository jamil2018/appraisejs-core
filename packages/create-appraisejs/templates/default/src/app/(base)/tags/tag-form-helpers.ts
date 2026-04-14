import { tagSchema, type Tag } from '@/constants/form-opts/tag-form-opts'
import { type ActionResponse } from '@/types/form/actionHandler'

export type TagFormSubmitAction = (_prev: unknown, value: Tag, id?: string) => Promise<ActionResponse>

export const tagFieldValidators = {
  name: tagSchema.shape.name,
  tagExpression: tagSchema.shape.tagExpression,
}

export function getActionErrorMessage(response: ActionResponse) {
  return response.error || response.message || 'Unable to save tag.'
}
