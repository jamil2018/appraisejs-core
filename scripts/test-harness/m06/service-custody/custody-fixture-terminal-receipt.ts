// Ordinary owner callback evidence only. No product, client, native, process or database operation.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { readTerminalEvidenceFile } from '../fixture-evidence-read.mjs'
import { assertServiceCallbackReceipt } from '../fixture-terminal-codecs.mjs'
import path from 'node:path'

export type FixtureTerminalScope = Readonly<{
  case: string
  pid: number
  nonce: string
  ownerScript: string
  terminalType: 'case-known-closed' | 'case-retained'
  terminalSequence: number
  handoffSequence: number
  expectedFixtureSha256: string
}>
const finalPhase = 'OWNER_HANDOFF_SEND_CALLBACK_COMMITTED'
const receiptName = 'owner-terminal-callback-commit.json'
const failureName = 'owner-failure-latch.json'

export function fixtureTerminalCallbackReceipt(scope: FixtureTerminalScope) {
  const receipt = { version: 1, type: 'owner-terminal-callback-commit', ...scope, phase: finalPhase }
  assertFixtureTerminalEvidence(receipt, undefined, scope)
  return Object.freeze(receipt)
}

// Validation is shared by the real supervisor reader and coupled inert contract tests.
export function assertFixtureTerminalEvidence(commit: unknown, failure: unknown, scope: FixtureTerminalScope) {
  return assertServiceCallbackReceipt(commit, failure, scope)
}

export function encodeFixtureTerminalCallbackReceipt(scope: FixtureTerminalScope) {
  const receipt = fixtureTerminalCallbackReceipt(scope)
  const encoded = JSON.stringify(receipt) + '\n'
  assert.ok(Buffer.byteLength(encoded) <= 4096, 'Callback-commit receipt bound')
  return { receipt, encoded }
}

// Only the original successful send callback invokes this exclusive synchronous publication.
// Any short/partial/duplicate/existing path throws. Never retry, replace or publish a fallback.
export function publishFixtureTerminalCallbackReceipt(workspace: string, encoded: string): void {
  assert.ok(Buffer.byteLength(encoded) <= 4096)
  writeFileSync(path.join(workspace, receiptName), encoded, { flag: 'wx', mode: 0o600 })
}

function readEvidenceFile(filename: string, limit: number): unknown {
  const evidence = readTerminalEvidenceFile(filename, limit)
  return evidence === undefined
    ? undefined
    : (JSON.parse(evidence.bytes.subarray(0, evidence.length).toString('utf8')) as unknown)
}

export function readFixtureTerminalCallbackEvidence(workspace: string, scope: FixtureTerminalScope) {
  const failure = readEvidenceFile(path.join(workspace, failureName), 16 * 1024)
  if (failure !== undefined) assertFixtureTerminalEvidence(undefined, failure, scope)
  const commit = readEvidenceFile(path.join(workspace, receiptName), 4096)
  assertFixtureTerminalEvidence(commit, undefined, scope)
  // First-failure precedence is rechecked at this final point-in-time evidence decision.
  const laterFailure = readEvidenceFile(path.join(workspace, failureName), 16 * 1024)
  return assertFixtureTerminalEvidence(commit, laterFailure, scope)
}
