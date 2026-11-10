import type { Stats, openSync, fstatSync, readSync, closeSync, lstatSync } from 'node:fs'
export type FixtureEvidenceIO = Readonly<{
  openSync: typeof openSync
  fstatSync: typeof fstatSync
  readSync: typeof readSync
  closeSync: typeof closeSync
  lstatSync: typeof lstatSync
}>
export type FixtureEvidence = Readonly<{ before: Stats; after: Stats; bytes: Buffer; length: number }>
export function readTerminalEvidenceFile(
  filename: string,
  limit: number,
  io?: FixtureEvidenceIO,
): FixtureEvidence | undefined
export function readReleaseEvidenceFile(
  filename: string,
  limit: number,
  io?: FixtureEvidenceIO,
): (FixtureEvidence & Readonly<{ actual: Stats }>) | undefined
