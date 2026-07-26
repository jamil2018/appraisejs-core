import { describe, expect, it } from 'vitest'

import { findStepFunctionBounds } from './step-definition-function-bounds'

describe('findStepFunctionBounds', () => {
  it('finds a single-line step definition with its JSDoc block', () => {
    const content = [
      'import { When } from "runtime"',
      '',
      '/**',
      ' * @name Login',
      ' */',
      'When("I log in", async function () {',
      '  await this.page.click("button")',
      '})',
      '',
      'const untouched = true',
    ].join('\n')

    expect(findStepFunctionBounds(content, 'When("I log in"')).toEqual({
      startLine: 2,
      endLine: 7,
    })
  })

  it('finds prettier-wrapped step signatures and balanced nested blocks', () => {
    const content = [
      'Then(',
      '  "I should see {string}",',
      '  async function (label: string) {',
      '    if (label) {',
      '      await expect(this.page.getByText(label)).toBeVisible()',
      '    }',
      '  },',
      ')',
    ].join('\n')

    expect(findStepFunctionBounds(content, 'Then(  "I should see {string}"')).toEqual({
      startLine: 0,
      endLine: 7,
    })
  })

  it('returns null when the signature is not present or the call is incomplete', () => {
    expect(findStepFunctionBounds('When("other", async function () {})', 'Then("missing"')).toBeNull()
    expect(findStepFunctionBounds('When("incomplete", async function () {', 'When("incomplete"')).toBeNull()
  })
})
