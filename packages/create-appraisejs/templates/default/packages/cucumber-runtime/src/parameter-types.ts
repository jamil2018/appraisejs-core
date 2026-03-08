import { defineParameterType } from '@cucumber/cucumber'

defineParameterType({
  name: 'boolean',
  regexp: /true|false/,
  transformer: (s: string) => s === 'true',
})
