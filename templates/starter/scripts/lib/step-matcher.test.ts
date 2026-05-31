import { describe, expect, it } from 'vitest'
import { StepParameterType } from '@prisma/client'
import {
  determineStepTypeAndIcon,
  extractParametersFromGherkinStep,
  sameResolvedParameters,
  signatureToRegex,
} from './step-matcher'

describe('signatureToRegex', () => {
  it('matches {string} placeholder', () => {
    expect(signatureToRegex('click {string}').test('click "submit"')).toBe(true)
  })

  it('matches {int} placeholder', () => {
    expect(signatureToRegex('wait {int} seconds').test('wait 15 seconds')).toBe(true)
  })

  it('matches {boolean} placeholder', () => {
    expect(signatureToRegex('flag is {boolean}').test('flag is true')).toBe(true)
  })

  it('matches {number} placeholder', () => {
    expect(signatureToRegex('value is {number}').test('value is 4.25')).toBe(true)
  })

  it('matches mixed placeholders', () => {
    expect(signatureToRegex('set {string} to {int}').test('set "count" to 2')).toBe(true)
  })

  it('matches no placeholder signature', () => {
    expect(signatureToRegex('open home').test('open home')).toBe(true)
  })
})

describe('extractParametersFromGherkinStep', () => {
  it('extracts parameters for matching text', () => {
    const result = extractParametersFromGherkinStep('set "count" to 2', 'set {string} to {int}', [
      { name: 'name', order: 0, type: StepParameterType.STRING },
      { name: 'value', order: 1, type: StepParameterType.NUMBER },
    ])
    expect(result).toEqual([
      { name: 'name', value: 'count', order: 0, type: StepParameterType.STRING },
      { name: 'value', value: '2', order: 1, type: StepParameterType.NUMBER },
    ])
  })

  it('returns null for non-matching text', () => {
    expect(extractParametersFromGherkinStep('open dashboard', 'set {string} to {int}', [])).toBeNull()
  })

  it('handles parameter count mismatch by truncating to template params', () => {
    const result = extractParametersFromGherkinStep('set "a" to 2', 'set {string} to {int}', [
      { name: 'onlyOne', order: 0, type: StepParameterType.STRING },
    ])
    expect(result).toEqual([{ name: 'onlyOne', value: 'a', order: 0, type: StepParameterType.STRING }])
  })
})

describe('determineStepTypeAndIcon', () => {
  it('maps Given', () => expect(determineStepTypeAndIcon('Given')).toEqual({ type: 'ACTION', icon: 'NAVIGATION' }))
  it('maps When', () => expect(determineStepTypeAndIcon('When')).toEqual({ type: 'ACTION', icon: 'MOUSE' }))
  it('maps Then', () => expect(determineStepTypeAndIcon('Then')).toEqual({ type: 'ASSERTION', icon: 'VALIDATION' }))
  it('maps And', () => expect(determineStepTypeAndIcon('And')).toEqual({ type: 'ACTION', icon: 'MOUSE' }))
  it('maps But', () => expect(determineStepTypeAndIcon('But')).toEqual({ type: 'ACTION', icon: 'MOUSE' }))
  it('maps unknown keyword to default', () =>
    expect(determineStepTypeAndIcon('Unknown')).toEqual({ type: 'ACTION', icon: 'MOUSE' }))
})

describe('sameResolvedParameters', () => {
  const sample = [{ name: 'x', value: '1', order: 0, type: StepParameterType.NUMBER }]

  it('returns true for equal arrays', () => {
    expect(sameResolvedParameters(sample, [...sample])).toBe(true)
  })

  it('returns false for different length', () => {
    expect(sameResolvedParameters(sample, [])).toBe(false)
  })

  it('returns false for different values', () => {
    expect(sameResolvedParameters(sample, [{ name: 'x', value: '2', order: 0, type: StepParameterType.NUMBER }])).toBe(
      false,
    )
  })
})
