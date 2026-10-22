// Fixed original operations; inert tests replace this module at its import boundary.
import { fork, spawn } from 'node:child_process'
import { openSync, closeSync } from 'node:fs'
export const sourceLaunchEffects = Object.freeze({ fork, spawn, openSync, closeSync, setInterval, clearInterval })
