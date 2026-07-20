import type { CustomWorld } from '../world.ts'

export type BuiltinOperationParameter = {
  name: string
  type: 'LOCATOR' | 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE'
}

export type BuiltinBrowserOperation = {
  id: string
  version: '1'
  parameters: BuiltinOperationParameter[]
  execute: (this: CustomWorld, ...parameters: never[]) => Promise<unknown>
}
