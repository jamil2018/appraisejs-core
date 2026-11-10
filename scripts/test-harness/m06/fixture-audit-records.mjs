// Fixture audit JSON only. Import performs no IO; publication remains exclusive and synchronous.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export function readFixtureAuditRecord(filename) {
  return JSON.parse(readFileSync(filename))
}

export function publishFixtureAuditRecord(directory, name, value) {
  writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
}
