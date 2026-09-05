import { describe, expect, it } from 'vitest'
import type { Environment } from '@prisma/client'
import { freezeJourneyExecutionEnvironment, restoreJourneyExecutionEnvironment } from './execution-environment'

const environment = {
  id: 'env-1',
  targetProjectId: 'target-1',
  name: 'Local',
  baseUrl: 'http://127.0.0.1:3001',
  apiBaseUrl: null,
  expectedPageTitle: null,
  username: null,
  credentialState: 'NONE',
  passwordEnvironmentVariable: null,
  scopeVersion: 1,
} as Environment

describe('Journey environment snapshots', () => {
  it('supports local HTTP while freezing executable fields', () => {
    const snapshot = freezeJourneyExecutionEnvironment(environment, 'LOCAL_WORKSPACE')
    const restored = restoreJourneyExecutionEnvironment({
      targetProjectId: 'target-1',
      environment: { ...environment, baseUrl: 'https://changed.example' },
      environmentSnapshotJson: snapshot.json,
      environmentSnapshotHash: snapshot.hash,
      environmentSnapshotVersion: snapshot.version,
    })
    expect(restored.baseUrl).toBe(environment.baseUrl)
  })
  it('keeps remote HTTPS origin restrictions', () => {
    expect(() => freezeJourneyExecutionEnvironment(environment, 'REMOTE_BLACK_BOX')).toThrow()
  })
  it('rejects tampered and cross-target packets', () => {
    const snapshot = freezeJourneyExecutionEnvironment(environment, 'LOCAL_WORKSPACE')
    const run = {
      environment,
      environmentSnapshotJson: snapshot.json,
      environmentSnapshotHash: snapshot.hash,
      environmentSnapshotVersion: snapshot.version,
    }
    expect(() => restoreJourneyExecutionEnvironment({ ...run, targetProjectId: 'other' })).toThrow()
    expect(() =>
      restoreJourneyExecutionEnvironment({ ...run, environmentSnapshotHash: `sha256:${'a'.repeat(64)}` }),
    ).toThrow()
  })
  it('rejects embedded credentials and inconsistent credential references', () => {
    expect(() =>
      freezeJourneyExecutionEnvironment({ ...environment, baseUrl: 'http://user:secret@localhost' }, 'LOCAL_WORKSPACE'),
    ).toThrow()
    expect(() =>
      freezeJourneyExecutionEnvironment({ ...environment, credentialState: 'REFERENCE_CONFIGURED' }, 'LOCAL_WORKSPACE'),
    ).toThrow()
  })
})
