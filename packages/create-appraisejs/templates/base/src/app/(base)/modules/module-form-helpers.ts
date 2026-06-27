import { moduleSchema, type Module as ModuleFormValues } from '@/constants/form-opts/module-form-opts'
import type { ActionResponse } from '@/types/form/actionHandler'

export type ModuleFormSubmitAction = (_prev: unknown, value: ModuleFormValues, id?: string) => Promise<ActionResponse>

export const moduleFieldValidators = {
  name: moduleSchema.shape.name,
}

export function getActionErrorMessage(response: ActionResponse) {
  return response.error || response.message || 'Unable to save module.'
}
