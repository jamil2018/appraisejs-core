import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const skills = [
  'appraise-project-from-brief',
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

  it('routes natural-language Appraise project briefs through project registration and plan creation', async () => {
    const projectFromBrief = await fs.readFile(
      path.join(process.cwd(), '..', '..', '.agents', 'skills', 'appraise-project-from-brief', 'SKILL.md'),
      'utf8',
    )

    expect(projectFromBrief).toContain('use Appraise')
    expect(projectFromBrief).toContain('create a project using AppraiseJS')
    expect(projectFromBrief).toContain('build an app with AppraiseJS')
    expect(projectFromBrief).toContain('.appraisejs/project.json')
    expect(projectFromBrief).toContain('project_diagnostic')
    expect(projectFromBrief).toContain('project_add')
    expect(projectFromBrief).toContain('plan_create')
    expect(projectFromBrief.indexOf('project_diagnostic')).toBeLessThan(projectFromBrief.indexOf('project_add'))
    expect(projectFromBrief.indexOf('project_add')).toBeLessThan(projectFromBrief.indexOf('plan_create'))
    expect(projectFromBrief).toContain('do not invent a name-derived plan id')
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

  it('requires diagnostic-first planning and review-ready evidence handling', async () => {
    const planning = await fs.readFile(
      path.join(process.cwd(), '..', '..', '.agents', 'skills', 'appraise-planning', 'SKILL.md'),
      'utf8',
    )
    expect(planning).toContain('project_diagnostic')
    expect(planning.indexOf('project_diagnostic')).toBeLessThan(planning.indexOf('plan_create'))
    expect(planning).toContain('plan_wait_for_review')
    expect(planning).toContain('plan_wait_for_approval')
    expect(planning.indexOf('plan_wait_for_review')).toBeLessThan(planning.indexOf('plan_wait_for_approval'))
    expect(planning).toContain('call one `plan_wait_for_approval` long poll')
    expect(planning).toContain('compact resumable state')
    expect(planning).toContain('plan_start')
    expect(planning).toContain('validation_preparation_started')
    expect(planning).toContain('plan_review_read')
    expect(planning).toContain('Acknowledge each handled event')
    expect(planning).toContain('only after')
    expect(planning).not.toContain('Stop at the review gate')
    expect(planning).not.toMatch(/repeated(?:ly)?\s+(?:\w+\s+){0,3}pending|pending\s+(?:\w+\s+){0,3}loop/i)
  })
})
