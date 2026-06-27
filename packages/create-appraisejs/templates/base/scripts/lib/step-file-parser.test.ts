import { describe, expect, it } from 'vitest'
import { mapTypeToParameterType, parseStepFile, parseStepJSDoc } from './step-file-parser'

describe('parseStepJSDoc', () => {
  it('parses valid step jsdoc', () => {
    const content = `/**
 * @name Click Save
 * @description clicks save button
 * @icon MOUSE
 */
When("click save", async function () {})`
    expect(parseStepJSDoc(content, 5)).toEqual({
      name: 'Click Save',
      description: 'clicks save button',
      icon: 'MOUSE',
    })
  })

  it('returns null when @icon is missing', () => {
    const content = `/**
 * @name Click Save
 */
When("click save", async function () {})`
    expect(parseStepJSDoc(content, 4)).toBeNull()
  })

  it('returns null when @name is missing', () => {
    const content = `/**
 * @icon MOUSE
 */
When("click save", async function () {})`
    expect(parseStepJSDoc(content, 4)).toBeNull()
  })
})

describe('mapTypeToParameterType', () => {
  it('maps SelectorName', () => expect(mapTypeToParameterType('SelectorName')).toBe('LOCATOR'))
  it('maps string', () => expect(mapTypeToParameterType('string')).toBe('STRING'))
  it('maps number', () => expect(mapTypeToParameterType('number')).toBe('NUMBER'))
  it('maps int', () => expect(mapTypeToParameterType('int')).toBe('NUMBER'))
  it('maps boolean', () => expect(mapTypeToParameterType('boolean')).toBe('BOOLEAN'))
  it('maps Date', () => expect(mapTypeToParameterType('Date')).toBe('DATE'))
  it('throws on unsupported type', () => expect(() => mapTypeToParameterType('unknown')).toThrow())
})

describe('parseStepFile', () => {
  it('parses minimal valid step file with one When step', () => {
    const content = `/**
 * @name Auth Steps
 * @type ACTION
 */
import { When } from "@cucumber/cucumber";
/**
 * @name Enter Email
 * @description fills email
 * @icon MOUSE
 */
When("enter {string}", async function (value: string) {
  // no-op
});`

    const parsed = parseStepFile(content, 'automation/steps/actions/auth.step.ts')
    expect(parsed).not.toBeNull()
    expect(parsed?.group.name).toBe('Auth Steps')
    expect(parsed?.steps).toHaveLength(1)
    expect(parsed?.steps[0].signature).toBe('enter {string}')
    expect(parsed?.steps[0].keyword).toBe('When')
    expect(parsed?.steps[0].source).toContain('@name Enter Email')
    expect(parsed?.steps[0].source).toContain('When("enter {string}"')
  })
})
