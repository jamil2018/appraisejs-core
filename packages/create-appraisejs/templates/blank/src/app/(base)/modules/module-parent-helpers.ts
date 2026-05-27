import { ROOT_MODULE_UUID } from '@/constants/form-opts/module-form-opts'

import type { ModuleParentOption, ModuleTableRow } from './module-types'

export function getModuleParentOptions(modules: ModuleTableRow[], excludedId?: string): ModuleParentOption[] {
  return modules
    .filter(module => module.id !== excludedId)
    .map(module => ({
      id: module.id,
      name: module.name,
    }))
}

export function getModuleFormParentId(parentId: string | null | undefined) {
  return parentId ?? ROOT_MODULE_UUID
}
