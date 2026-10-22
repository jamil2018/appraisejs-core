import assert from 'node:assert/strict'
import {
  providerSourceDatabaseSnapshot,
  type ProviderSourceDatabase,
} from '@/lib/quality-journey/provider-source-database'

// Read-only diagnostics at the original post-cleanup assertion point. No cleanup or authority admission.
export function assertFixtureDatabaseClosed(database: ProviderSourceDatabase) {
  const resources = providerSourceDatabaseSnapshot(database)
  for (const resource of [resources.canonical, resources.resolver]) {
    assert.equal(resource.closed, true)
    assert.equal(resource.engineClosed, true)
    assert.equal(resource.nativeClosed, true)
    assert.equal(resource.stopCalls, 1)
    assert.equal(resource.nativeCalls, 1)
  }
  assert.equal(resources.cleanupPending, false)
  return resources
}
