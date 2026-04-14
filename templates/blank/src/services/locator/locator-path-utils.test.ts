import path from 'path'
import { describe, expect, it } from 'vitest'
import { extractLocatorGroupName, extractModulePathFromLocatorFile } from './locator-path-utils'

describe('locator-path-utils', () => {
  it('extractLocatorGroupName strips json extension', () => {
    expect(extractLocatorGroupName('g:\\app\\automation\\locators\\base\\Login.json')).toBe('Login')
  })

  it('extractModulePathFromLocatorFile returns root for file at locators root', () => {
    const fileAtRoot = path.join(process.cwd(), 'automation', 'locators', 'Login.json')
    expect(extractModulePathFromLocatorFile(fileAtRoot)).toBe('/')
  })
})
