import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const skills = [
  'appraise-planning',
  'appraise-continuation',
  'appraise-validation-preparation',
  'appraise-baseline',
  'appraise-implementation',
  'appraise-completion',
]

describe('Appraise workflow skills', () => {
  it.each(skills)('%s keeps lifecycle rules in AppraiseJS and checks durable events', async skill => {
    const source = await fs.readFile(
      path.join(process.cwd(), '..', '..', '.agents', 'skills', skill, 'SKILL.md'),
      'utf8',
    )
    expect(source).toContain('AppraiseJS owns lifecycle and business rules')
    expect(source).toContain('Read pending events')
    expect(source).toContain('appraise://')
    expect(source).not.toMatch(/sqlite3|prisma\.\w+|git (commit|push)/i)
  })

  it('prevents work while approvals are pending and reports follow-up evidence at completion', async () => {
    const sources = await Promise.all(
      skills.map(skill =>
        fs.readFile(path.join(process.cwd(), '..', '..', '.agents', 'skills', skill, 'SKILL.md'), 'utf8'),
      ),
    )
    expect(sources.join('\n')).toContain('Do not implement while approval is pending')
    expect(sources.join('\n')).toContain('optional failures')
    expect(sources.join('\n')).toContain('non-blocking remarks')
  })
})
