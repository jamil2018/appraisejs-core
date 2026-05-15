import { syncLocatorsFromFilesAction } from '@/actions/locator/locator-actions'

import {
  showLocatorSyncFailureToast,
  showLocatorSyncToast,
  type LocatorSyncPayload,
} from './locator-sync-toast'

export async function runLocatorFileSync(refresh: () => void) {
  try {
    const result = await syncLocatorsFromFilesAction()

    if (result.status === 200 && result.data) {
      showLocatorSyncToast(result.data as LocatorSyncPayload, refresh)
      return
    }

    showLocatorSyncFailureToast(result.error || 'An error occurred during sync')
  } catch (error) {
    showLocatorSyncFailureToast(`An error occurred: ${error}`)
  }
}
