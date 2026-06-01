import { describe, expect, it } from 'vitest'
import { getEmptyEnvironmentsFileContent, setSeededTemplateFilesTracked } from './scaffold-gitignore.js'

describe('setSeededTemplateFilesTracked', () => {
  it('makes the seeded files tracked in the bundled template', () => {
    const input = ['*.db', 'automation/config/environments/environments.json', ''].join('\n')

    expect(setSeededTemplateFilesTracked(input, true)).toBe(
      ['*.db', '!prisma/dev.db', '!automation/config/environments/environments.json', ''].join('\n'),
    )
  })

  it('makes the seeded files ignored again after setup', () => {
    const input = ['*.db', '!prisma/dev.db', '!automation/config/environments/environments.json', ''].join('\n')

    expect(setSeededTemplateFilesTracked(input, false)).toBe(
      ['*.db', 'prisma/dev.db', 'automation/config/environments/environments.json', ''].join('\n'),
    )
  })
})

describe('getEmptyEnvironmentsFileContent', () => {
  it('resets environments.json to an empty object', () => {
    expect(getEmptyEnvironmentsFileContent()).toBe('{}\n')
  })
})
