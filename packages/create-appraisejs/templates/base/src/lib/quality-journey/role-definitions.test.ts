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

  it('grants successor Designer inputs only in registry v4', () => {
    const v3Designer = resolveQualityJourneyRoleDefinition('3', 'TEST_SCENARIO_DESIGNER')!
    const v4Designer = resolveQualityJourneyRoleDefinition('4', 'TEST_SCENARIO_DESIGNER')!
    expect(v3Designer.readableArtifacts).not.toContain('SCENARIO_PORTFOLIO_REVISION')
    expect(v4Designer.readableArtifacts).toEqual(
      expect.arrayContaining(['SCENARIO_PORTFOLIO_REVISION', 'SCENARIO_REVISION', 'SCENARIO_REVISION_FEEDBACK']),
    )
  })
})
