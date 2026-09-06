import { promises as fs } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Journey-only coordinator boundary', () => {
  it('exposes Journey locator routing and no removed quality domains', async () => {
    const source = await fs.readFile(path.join(__dirname, 'route.ts'), 'utf8')
    expect(source).toContain("operation[1] === 'journeys'")
    expect(source).toContain('journeyId')
    expect(source).not.toContain("operation[1] === 'plans'")
    expect(source).not.toContain("operation[1] === 'assessments'")
    expect(source).not.toContain("operation[1] === 'methodologies'")
    expect(source).not.toContain('compatibilityResponse')
  })
})
