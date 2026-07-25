import { resolveLocator } from '../../locator.util.ts'
import { runLocatorStepOperation, runPageStepOperation } from '../../step-operations.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const structuredOperationsBuiltins = [
  {
    id: 'browser.structured.operations.run.structured.locator.operation',
    version: '1',
    parameters: [
      { name: 'operation', type: 'STRING' },
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'argumentsJson', type: 'STRING' },
      { name: 'optionsJson', type: 'STRING' },
    ],
    execute: async function (
      this: CustomWorld,
      operation: string,
      elementName: SelectorName,
      argumentsJson: string,
      optionsJson: string,
    ) {
      const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      try {
        await runLocatorStepOperation(this.page.locator(selector), operation, argumentsJson, optionsJson, name =>
          this.getVar(name),
        )
      } catch (error) {
        throw new Error(`Structured locator operation ${operation} failed for ${elementName}: ${error}`)
      }
    },
  },
  {
    id: 'browser.structured.operations.run.structured.page.operation',
    version: '1',
    parameters: [
      { name: 'operation', type: 'STRING' },
      { name: 'argumentsJson', type: 'STRING' },
      { name: 'optionsJson', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, operation: string, argumentsJson: string, optionsJson: string) {
      try {
        await runPageStepOperation(this.page, operation, argumentsJson, optionsJson, name => this.getVar(name))
      } catch (error) {
        throw new Error(`Structured page operation ${operation} failed: ${error}`)
      }
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
