import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const skillUrl = new URL(
  '../codex-marketplace/plugins/appraise-quality-journey/skills/appraise-quality-journey/SKILL.md',
  import.meta.url,
)

describe('Appraise Quality Journey skill', () => {
  it('preserves the authoritative Analysis human-wait and reconnect protocol', async () => {
    const skill = await readFile(skillUrl, 'utf8')

    for (const requiredBoundary of [
      'quality_journey_library_list',
      'quality_journey_artifact_get',
      'quality_journey_external_work_claim_v1',
      'quality_journey_external_work_admit_v1',
      'quality_journey_external_analyzer_analysis_submit_v1',
      'quality_journey_external_work_outcome_get_v1',
      'quality_journey_analysis_get',
      'quality_journey_analysis_answer',
      'quality_journey_resume',
    ]) {
      expect(skill).toContain(requiredBoundary)
    }
    const claim = skill.indexOf('quality_journey_external_work_claim_v1')
    const libraryRead = skill.indexOf('quality_journey_library_list')
    const admit = skill.indexOf('quality_journey_external_work_admit_v1')
    const submit = skill.indexOf('quality_journey_external_analyzer_analysis_submit_v1')
    const stop = skill.indexOf('report that Appraise is awaiting the human and stop the task')
    const reread = skill.indexOf('then reread `quality_journey_get` and `quality_journey_analysis_get`')
    const continuationClaim = skill.indexOf('before\n   claiming or continuing work')

    expect(claim).toBeLessThan(libraryRead)
    expect(libraryRead).toBeLessThan(admit)
    expect(admit).toBeLessThan(submit)
    expect(submit).toBeLessThan(stop)
    expect(stop).toBeLessThan(reread)
    expect(reread).toBeLessThan(continuationClaim)
    expect(skill).toContain('`REQUIREMENT_REVISION:<assignment.artifactId>`')
    expect(skill).toContain('`sourceContentHash` equals the assignment `contentHash`')
    expect(skill).toContain("must not be compared with the assignment's database revision ID")
    expect(skill).toContain('it reconstructs Appraise work and never proves that the old Codex task resumed')
    expect(skill).toContain('specialized submission accepted, published for review, and approval recorded in')
    expect(skill).toContain('does not independently attest that the project credential belongs to a')
    expect(skill).toContain('cannot claim to have stopped arbitrary external Codex')
  })
})
