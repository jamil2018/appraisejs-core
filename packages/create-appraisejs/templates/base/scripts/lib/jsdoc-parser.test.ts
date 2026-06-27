import { describe, expect, it } from 'vitest'
import { parseGroupJSDoc } from './jsdoc-parser'

describe('parseGroupJSDoc', () => {
  it('parses ACTION group metadata', () => {
    const content = `/**
 * @name Auth Actions
 * @description auth flows
 * @type ACTION
 */`
    expect(parseGroupJSDoc(content)).toEqual({
      name: 'Auth Actions',
      description: 'auth flows',
      type: 'ACTION',
    })
  })

  it('parses VALIDATION group metadata', () => {
    const content = `/**
 * @name Auth Validations
 * @type VALIDATION
 */`
    expect(parseGroupJSDoc(content)).toEqual({
      name: 'Auth Validations',
      description: null,
      type: 'VALIDATION',
    })
  })

  it('returns null when @type is missing', () => {
    const content = `/**
 * @name Missing Type
 */`
    expect(parseGroupJSDoc(content)).toBeNull()
  })

  it('returns null when @name is missing', () => {
    const content = `/**
 * @type ACTION
 */`
    expect(parseGroupJSDoc(content)).toBeNull()
  })

  it('returns null for empty content', () => {
    expect(parseGroupJSDoc('')).toBeNull()
  })

  it('parses when imports are before jsdoc', () => {
    const content = `import { x } from 'y'
/**
 * @name Imported Group
 * @type ACTION
 */`
    expect(parseGroupJSDoc(content)?.name).toBe('Imported Group')
  })

  it('parses when formatted multiline imports are before jsdoc', () => {
    const content = `import {
  x,
  y,
} from 'z'
/**
 * @name Multiline Imported Group
 * @type ACTION
 */`
    expect(parseGroupJSDoc(content)?.name).toBe('Multiline Imported Group')
  })

  it('returns null for malformed close', () => {
    const content = `/**
 * @name Broken
 * @type ACTION`
    expect(parseGroupJSDoc(content)).toBeNull()
  })
})
