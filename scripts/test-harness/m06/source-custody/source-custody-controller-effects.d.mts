import { fork } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync } from 'node:fs'
export const sourceControllerEffects: Readonly<{
  process: NodeJS.Process
  fork: typeof fork
  randomUUID: typeof randomUUID
  mkdirSync: typeof mkdirSync
  mkdtempSync: typeof mkdtempSync
  setInterval: typeof setInterval
  clearInterval: typeof clearInterval
}>
