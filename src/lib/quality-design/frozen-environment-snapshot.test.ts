import { describe, expect, it } from 'vitest'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from './state'
import { canonicalFrozenRemoteEnvironmentPacket, frozenEnvironmentSnapshot } from './frozen-environment-snapshot'

const row = {
  id: 'environment-1',
  targetProjectId: 'target-1',
  name: 'Sauce Demo',
  baseUrl: 'https://www.saucedemo.com/',
  expectedPageTitle: null,
  apiBaseUrl: null,
  username: null,
  credentialState: 'NONE',
  passwordEnvironmentVariable: null,
  scopeVersion: 7,
}
const snapshot = canonicalFrozenRemoteEnvironmentPacket(row)

function run(overrides: Record<string, unknown> = {}) {
  return {
    environment: { id: 'environment-1' },
    targetProjectId: 'target-1',
    environmentSnapshotHash: hashCanonical(snapshot),
    environmentSnapshotJson: canonicalContractJson(snapshot),
    environmentSnapshotVersion: 7,
    ...overrides,
  }
}

describe('frozen environment snapshot', () => {
  it('canonicalizes a trailing-slash row at construction and accepts the exact packet', () => {
    expect(snapshot.baseUrl).toBe('https://www.saucedemo.com')
    expect(frozenEnvironmentSnapshot(run())).toEqual(snapshot)
  })

  it('rejects a tampered canonical packet before materialization or sealing', () => {
    expect(() =>
      frozenEnvironmentSnapshot(
        run({ environmentSnapshotJson: canonicalContractJson({ ...snapshot, baseUrl: 'https://wrong.example' }) }),
      ),
    ).toThrow('hash')
  })

  it('rejects a packet for a different Environment or target id', () => {
    expect(() => frozenEnvironmentSnapshot(run({ environment: { id: 'environment-2' } }))).toThrow('does not match')
    expect(() => frozenEnvironmentSnapshot(run({ targetProjectId: 'target-2' }))).toThrow('target project')
  })

  it('rejects hash-consistent incomplete, extra, noncanonical, malformed credential, and null-version packets', () => {
    const invalid = [
      { ...snapshot, username: undefined },
      { ...snapshot, unexpected: true },
      { ...snapshot, scopeVersion: '7' },
      { ...snapshot, baseUrl: 'https://www.saucedemo.com/' },
      { ...snapshot, credentialReference: undefined },
      { ...snapshot, credentialBindingState: 'REFERENCE_CONFIGURED', hasPassword: false },
      { ...snapshot, credentialBindingState: 'NONE', hasPassword: true, credentialReference: 'PASSWORD_REF' },
    ]
    for (const packet of invalid)
      expect(() =>
        frozenEnvironmentSnapshot(
          run({
            environmentSnapshotHash: hashCanonical(packet),
            environmentSnapshotJson: canonicalContractJson(packet),
          }),
          { required: true },
        ),
      ).toThrow('strict canonical')
    expect(() => frozenEnvironmentSnapshot(run({ environmentSnapshotVersion: null }), { required: true })).toThrow(
      'version',
    )
  })
})
