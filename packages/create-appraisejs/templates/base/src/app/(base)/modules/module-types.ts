import type { ModuleWithParent } from '@/services/module/module-service'

export type ModuleTableRow = ModuleWithParent

export type ModuleParentOption = {
  id: string
  name: string
}
