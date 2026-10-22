import type { fork, spawn } from 'node:child_process'
import type { openSync, closeSync } from 'node:fs'
export type SourceLaunchEffects = Readonly<{
  fork: typeof fork
  spawn: typeof spawn
  openSync: typeof openSync
  closeSync: typeof closeSync
  setInterval: typeof setInterval
  clearInterval: typeof clearInterval
}>
export const sourceLaunchEffects: SourceLaunchEffects
