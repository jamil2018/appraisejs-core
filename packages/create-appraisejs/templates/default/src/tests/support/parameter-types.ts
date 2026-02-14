import { defineParameterType } from '@cucumber/cucumber'

/**
 * Register custom parameter types used in step definitions.
 * Cucumber only has built-in types for {string}, {int}, {float}, {word} —
 * {boolean} must be defined here so steps like "should be true" work.
 */
defineParameterType({
  name: 'boolean',
  regexp: /true|false/,
  transformer: (s: string) => s === 'true',
})
