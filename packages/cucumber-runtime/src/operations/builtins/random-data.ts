import { generateRandomData, RandomDataType } from '../../random-data.util.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const randomDataBuiltins = [
  {
    id: 'browser.random.data.generate.random.address.and.save.in.variable',
    version: '1',
    parameters: [{ name: 'variableName', type: 'STRING' }],
    execute: async function (this: CustomWorld, variableName: string) {
      const data = generateRandomData(RandomDataType.ADDRESS)
      try {
        this.setVar(variableName, data)
      } catch (error) {
        throw new Error(
          `Failed to generate a random address and store it inside the variable ${variableName}: ${error}`,
        )
      }
    },
  },
  {
    id: 'browser.random.data.generate.random.email.and.save.in.variable',
    version: '1',
    parameters: [{ name: 'variableName', type: 'STRING' }],
    execute: async function (this: CustomWorld, variableName: string) {
      const data = generateRandomData(RandomDataType.EMAIL)
      try {
        this.setVar(variableName, data)
      } catch (error) {
        throw new Error(`Failed to generate a random email and store it inside the variable ${variableName}: ${error}`)
      }
    },
  },
  {
    id: 'browser.random.data.generate.random.first.name.and.save.in.variable',
    version: '1',
    parameters: [{ name: 'variableName', type: 'STRING' }],
    execute: async function (this: CustomWorld, variableName: string) {
      const data = generateRandomData(RandomDataType.FIRST_NAME)
      try {
        this.setVar(variableName, data)
      } catch (error) {
        throw new Error(
          `Failed to generate a random first name and store it inside the variable ${variableName}: ${error}`,
        )
      }
    },
  },
  {
    id: 'browser.random.data.generate.random.full.name.and.save.in.variable',
    version: '1',
    parameters: [{ name: 'variableName', type: 'STRING' }],
    execute: async function (this: CustomWorld, variableName: string) {
      const data = generateRandomData(RandomDataType.FULL_NAME)
      try {
        this.setVar(variableName, data)
      } catch (error) {
        throw new Error(
          `Failed to generate a random full name and store it inside the variable ${variableName}: ${error}`,
        )
      }
    },
  },
  {
    id: 'browser.random.data.generate.random.last.name.and.save.in.variable',
    version: '1',
    parameters: [{ name: 'variableName', type: 'STRING' }],
    execute: async function (this: CustomWorld, variableName: string) {
      const data = generateRandomData(RandomDataType.LAST_NAME)
      try {
        this.setVar(variableName, data)
      } catch (error) {
        throw new Error(
          `Failed to generate a random last name and store it inside the variable ${variableName}: ${error}`,
        )
      }
    },
  },
  {
    id: 'browser.random.data.generate.random.password.and.save.in.variable',
    version: '1',
    parameters: [{ name: 'variableName', type: 'STRING' }],
    execute: async function (this: CustomWorld, variableName: string) {
      const data = generateRandomData(RandomDataType.PASSWORD)
      try {
        this.setVar(variableName, data)
      } catch (error) {
        throw new Error(
          `Failed to generate a random password and store it inside the variable ${variableName}: ${error}`,
        )
      }
    },
  },
  {
    id: 'browser.random.data.generate.random.phone.and.save.in.variable',
    version: '1',
    parameters: [{ name: 'variableName', type: 'STRING' }],
    execute: async function (this: CustomWorld, variableName: string) {
      const data = generateRandomData(RandomDataType.PHONE)
      try {
        this.setVar(variableName, data)
      } catch (error) {
        throw new Error(`Failed to generate a random phone and store it inside the variable ${variableName}: ${error}`)
      }
    },
  },
  {
    id: 'browser.random.data.generate.random.unique.text.and.save.in.variable',
    version: '1',
    parameters: [{ name: 'variableName', type: 'STRING' }],
    execute: async function (this: CustomWorld, variableName: string) {
      const data = generateRandomData(RandomDataType.UNIQUE_TEXT)
      try {
        this.setVar(variableName, data)
      } catch (error) {
        throw new Error(
          `Failed to generate a random unique text and store it inside the variable ${variableName}: ${error}`,
        )
      }
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
