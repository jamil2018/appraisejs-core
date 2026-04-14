import { describe, expect, it } from 'vitest'
import { extractLocatorGroupName, extractTestSuiteNameFromFilename } from './filename-utils'

describe('filename utils', () => {
  it('extractTestSuiteNameFromFilename handles .feature extension', () => {
    expect(extractTestSuiteNameFromFilename('login.feature')).toBe('login')
  })

  it('extractTestSuiteNameFromFilename handles nested unix path', () => {
    expect(extractTestSuiteNameFromFilename('/a/b/login-validation.feature')).toBe('login-validation')
  })

  it('extractTestSuiteNameFromFilename handles windows path', () => {
    expect(extractTestSuiteNameFromFilename('a\\b\\suite.feature')).toBe('suite')
  })

  it('extractLocatorGroupName handles json extension', () => {
    expect(extractLocatorGroupName('buttons.json')).toBe('buttons')
  })

  it('extractLocatorGroupName handles nested path', () => {
    expect(extractLocatorGroupName('/a/b/users.json')).toBe('users')
  })
})
