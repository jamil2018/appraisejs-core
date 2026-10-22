// Fixed direct-entry/transport operations. Import installs no process policy and starts no work.
import { fork } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync } from 'node:fs'
export const sourceControllerEffects = Object.freeze({
  process,
  fork,
  randomUUID,
  mkdirSync,
  mkdtempSync,
  setInterval,
  clearInterval,
})
