'use server'

import { revalidatePath } from 'next/cache'
import { runRequestedSync, type SyncExecutionResult } from '@/lib/sync/sync-executor'
import { isSyncRequestId } from '@/lib/sync/sync-registry'

export async function runSyncAction(requestedScriptId: string): Promise<SyncExecutionResult | InvalidSyncExecutionResult> {
  if (!isSyncRequestId(requestedScriptId)) {
    return {
      requestedScriptId,
      executedScriptIds: [],
      success: false,
      exitCode: 400,
      durationMs: 0,
      cause: 'Invalid sync target requested.',
    }
  }

  try {
    const result = await runRequestedSync(requestedScriptId)
    revalidatePath('/settings')
    return result
  } catch (error) {
    return {
      requestedScriptId,
      executedScriptIds: [],
      success: false,
      durationMs: 0,
      cause: error instanceof Error ? error.message : String(error),
    }
  }
}

type InvalidSyncExecutionResult = {
  requestedScriptId: string
  executedScriptIds: []
  success: false
  exitCode?: number
  durationMs: number
  cause?: string
}
