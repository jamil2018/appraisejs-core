#!/usr/bin/env node
// Additive fixed artifact wrapper. Assembly never executes Codex, Rust, or a provider.
import { runNativePatchCli, formatNativePatchSummary } from './m06-native-patch-cli.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareExactNativeBundle12 } from './m06-native-patch-12.mjs'

export const bundle13 = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../tasks/codex-app-server-journeys/m06-native-patch-13',
)
export function prepareNativePatch13(options) {
  return prepareExactNativeBundle12({ ...options, bundle: bundle13 })
}
runNativePatchCli(import.meta.url, prepareNativePatch13, formatNativePatchSummary)
