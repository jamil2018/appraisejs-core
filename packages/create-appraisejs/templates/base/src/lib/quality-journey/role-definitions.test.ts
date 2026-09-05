import { describe, expect, it } from 'vitest'

import { qualityJourneyContractDigest, resolveQualityJourneyRoleDefinition, type QualityJourneyRole } from './index'

const expectedDigests = {
  '1': {
    REQUIREMENT_ANALYZER: 'sha256:65ead5b6d8665149fd345aeb0128189fb845f5ca3801e9d3f33a37832d1ee2b5',
    SCOUT: 'sha256:6cef6ea961d44f618fe3154ea1194ede8a79da91d4e78603058985fe2055c49d',
    RESOURCE_EXPLORER: 'sha256:77a12a910e063eafe964048ecb3a39a9684f7ab2764e801672804c0538ef51e1',
    TEST_SCENARIO_DESIGNER: 'sha256:04179306b9f4aaaf0661ee5fbf832c5674202764758cc8bdf6995696749a2243',
    AUTOMATOR: 'sha256:3879641e03c7dde1b906eac394506534fdb735b4eaa2f2acd16d75608387725f',
    TRIAGER: 'sha256:d13df83b7c2b3451fcb2629c65e1ea15c0e720116e1552940c0e5a285c141c43',
  },
  '2': {
    REQUIREMENT_ANALYZER: 'sha256:aae390bd289cdb2cc33cadd19e1d19e2583e7442c2dfc250f7aa02772619182a',
    SCOUT: 'sha256:6cef6ea961d44f618fe3154ea1194ede8a79da91d4e78603058985fe2055c49d',
    RESOURCE_EXPLORER: 'sha256:77a12a910e063eafe964048ecb3a39a9684f7ab2764e801672804c0538ef51e1',
    TEST_SCENARIO_DESIGNER: 'sha256:04179306b9f4aaaf0661ee5fbf832c5674202764758cc8bdf6995696749a2243',
    AUTOMATOR: 'sha256:3879641e03c7dde1b906eac394506534fdb735b4eaa2f2acd16d75608387725f',
    TRIAGER: 'sha256:d13df83b7c2b3451fcb2629c65e1ea15c0e720116e1552940c0e5a285c141c43',
  },
  '3': {
    REQUIREMENT_ANALYZER: 'sha256:aae390bd289cdb2cc33cadd19e1d19e2583e7442c2dfc250f7aa02772619182a',
    SCOUT: 'sha256:52387ad0667d425e08e48a5a406bb5e720b6f4b108fee682e844b092626c8b25',
    RESOURCE_EXPLORER: 'sha256:8d4baa92f780e6fdca3dafa90b48db1f444a604fa2fb553ddc44e0f102c96fe4',
    TEST_SCENARIO_DESIGNER: 'sha256:04179306b9f4aaaf0661ee5fbf832c5674202764758cc8bdf6995696749a2243',
    AUTOMATOR: 'sha256:3879641e03c7dde1b906eac394506534fdb735b4eaa2f2acd16d75608387725f',
    TRIAGER: 'sha256:d13df83b7c2b3451fcb2629c65e1ea15c0e720116e1552940c0e5a285c141c43',
  },
  '4': {
    REQUIREMENT_ANALYZER: 'sha256:aae390bd289cdb2cc33cadd19e1d19e2583e7442c2dfc250f7aa02772619182a',
    SCOUT: 'sha256:52387ad0667d425e08e48a5a406bb5e720b6f4b108fee682e844b092626c8b25',
    RESOURCE_EXPLORER: 'sha256:8d4baa92f780e6fdca3dafa90b48db1f444a604fa2fb553ddc44e0f102c96fe4',
    TEST_SCENARIO_DESIGNER: 'sha256:4594bde9f05c1a1e98c4017e5c0eaf564a2683bbc4c8915ce8c6fe5de6b6b45b',
    AUTOMATOR: 'sha256:3879641e03c7dde1b906eac394506534fdb735b4eaa2f2acd16d75608387725f',
    TRIAGER: 'sha256:d13df83b7c2b3451fcb2629c65e1ea15c0e720116e1552940c0e5a285c141c43',
  },
  '5': {
    REQUIREMENT_ANALYZER: 'sha256:aae390bd289cdb2cc33cadd19e1d19e2583e7442c2dfc250f7aa02772619182a',
    SCOUT: 'sha256:52387ad0667d425e08e48a5a406bb5e720b6f4b108fee682e844b092626c8b25',
    RESOURCE_EXPLORER: 'sha256:8d4baa92f780e6fdca3dafa90b48db1f444a604fa2fb553ddc44e0f102c96fe4',
    TEST_SCENARIO_DESIGNER: 'sha256:4594bde9f05c1a1e98c4017e5c0eaf564a2683bbc4c8915ce8c6fe5de6b6b45b',
    AUTOMATOR: 'sha256:3123cfb96a4346c082ed234f9994bb29e480cd67535cf0cd2b5dd378282baca4',
    TRIAGER: 'sha256:90621a6d8a0c8601a30342ce6005378ca64e6e5a3a5c66b551cc6056609c476b',
  },
} as const satisfies Record<string, Record<QualityJourneyRole, string>>

describe('Quality Journey historical role registries', () => {
  it('keeps every issued role/version contract digest frozen', () => {
    for (const [version, roles] of Object.entries(expectedDigests)) {
      for (const [role, digest] of Object.entries(roles)) {
        const definition = resolveQualityJourneyRoleDefinition(version, role as QualityJourneyRole)
        expect(definition, `${version}:${role}`).toBeDefined()
        expect(qualityJourneyContractDigest(definition!)).toBe(digest)
      }
    }
  })

  it('preserves v4 Triager authority and adds only reviewed report inputs in v5', () => {
    expect(qualityJourneyContractDigest(resolveQualityJourneyRoleDefinition('4', 'TRIAGER')!)).toBe(
      expectedDigests['3'].TRIAGER,
    )
    expect(resolveQualityJourneyRoleDefinition('5', 'TRIAGER')!.readableArtifacts).toEqual([
      ...resolveQualityJourneyRoleDefinition('4', 'TRIAGER')!.readableArtifacts,
      'TEST_REPORT_ANALYSIS_REVISION',
      'REPORT_REVISION_FEEDBACK',
    ])
  })

  it('grants successor Designer inputs only in registry v4', () => {
    const v3Designer = resolveQualityJourneyRoleDefinition('3', 'TEST_SCENARIO_DESIGNER')!
    const v4Designer = resolveQualityJourneyRoleDefinition('4', 'TEST_SCENARIO_DESIGNER')!
    expect(v3Designer.readableArtifacts).not.toContain('SCENARIO_PORTFOLIO_REVISION')
    expect(v4Designer.readableArtifacts).toEqual(
      expect.arrayContaining(['SCENARIO_PORTFOLIO_REVISION', 'SCENARIO_REVISION', 'SCENARIO_REVISION_FEEDBACK']),
    )
  })
})
