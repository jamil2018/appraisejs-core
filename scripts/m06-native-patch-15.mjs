#!/usr/bin/env node
// Additive fixed artifact wrapper. Assembly never executes Codex, Rust, or a provider.
import { runNativePatchCli, formatNativePatchSummary } from './m06-native-patch-cli.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareExactNativeBundle12 } from './m06-native-patch-12.mjs'

export const bundle15 = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../tasks/codex-app-server-journeys/m06-native-patch-15',
)
export function prepareNativePatch15(options) {
  return prepareExactNativeBundle12({ ...options, bundle: bundle15 })
}
runNativePatchCli(import.meta.url, prepareNativePatch15, formatNativePatchSummary)
