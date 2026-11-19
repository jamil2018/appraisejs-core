import { manifestCli } from '../runtime-common.mts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requiredInputPaths as sharedInputPaths, verifyEffectiveConfig } from '../b1/runner.mts'
import { B1Transport, loadValidators } from '../b1/transport.mjs'

import {
  readDiagnosticConfiguration,
  object,
  diagnosticCommonPath,
  runOwnedDiagnostic,
  diagnosticResult,
  verifyDiagnosticManifest,
} from '../diagnostic-common.mts'
import type { DiagnosticManifest } from '../diagnostic-common.mts'
export type D0Manifest = DiagnosticManifest & { version: 'm13-d0/v1' }
type DiagnosticEvent = { category: 'notification_method'; method: string; sequence: number; phase: string }
const sourcePath = fileURLToPath(import.meta.url)
export function notificationInputPaths(schemaRoot: string) {
  return [...new Set([...sharedInputPaths(schemaRoot), diagnosticCommonPath, sourcePath])]
}
export function loadNotificationMethods(schemaRoot: string): Set<string> {
  const schema = JSON.parse(readFileSync(join(schemaRoot, 'ServerNotification.json'), 'utf8'))
  return new Set(
    schema.oneOf.flatMap((branch: { properties: { method: { enum: string[] } } }) => branch.properties.method.enum),
  )
}
/** An explicit field projection, never a spread of a codec event or notification payload. */
export function notificationDiagnosticEvent(value: unknown, methods: Set<string>): DiagnosticEvent | undefined {
  if (
    !object(value) ||
    value.category !== 'notification_method' ||
    typeof value.method !== 'string' ||
    !methods.has(value.method) ||
    !Number.isSafeInteger(value.sequence) ||
    Number(value.sequence) < 1 ||
    typeof value.phase !== 'string' ||
    !['UNSTARTED', 'INITIALIZATION', 'CONFIGURATION'].includes(value.phase)
  )
    return
  return { category: 'notification_method', method: value.method, sequence: Number(value.sequence), phase: value.phase }
}
export function verifyNotificationManifest(manifestPath: string, expectedHash: string): D0Manifest {
  return verifyDiagnosticManifest(manifestPath, expectedHash, 'd0', notificationInputPaths) as D0Manifest
}

/** This diagnostic has no thread/status/account/model/turn/tool method in its callable protocol surface. */
export async function runNotificationDiagnosticProtocol(
  client: Pick<B1Transport, 'initialize' | 'configRead' | 'assertHealthy'>,
  root: string,
) {
  const config = await readDiagnosticConfiguration(client, root)
  client.assertHealthy()
  verifyEffectiveConfig(config, root, 'healthy')
}

/** One additive cause-observation allocation. Importing source never reserves or launches a process. */
async function runDiagnostic(manifestPath: string, manifestSha256: string) {
  const manifest = verifyNotificationManifest(manifestPath, manifestSha256)
  const validate = loadValidators(manifest.schemaRoot)
  const methods = loadNotificationMethods(manifest.schemaRoot)
  const state = await runOwnedDiagnostic(manifest, manifestSha256, {
    validate,
    selectEvent: value => notificationDiagnosticEvent(value, methods),
    protocol: client => runNotificationDiagnosticProtocol(client, manifest.freshRoot),
  })
  const { record, physicalCleanup, failure, observedMethods } = state
  const causeObserved = !!physicalCleanup && failure === 'notification_refused' && observedMethods.length > 0
  const result = {
    ...diagnosticResult(state),
    disposition: !physicalCleanup ? 'UNKNOWN' : causeObserved ? 'CAUSE_OBSERVED' : 'NO_CAUSE_OBSERVED',
  }
  record(result)
  return result
}
manifestCli(sourcePath, runDiagnostic, result => result.disposition === 'CAUSE_OBSERVED')
