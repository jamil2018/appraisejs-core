#!/usr/bin/env node
// Additive fixed artifact wrapper. Assembly never executes Codex, Rust, or a provider.
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
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 6 || args[0] !== '--source' || args[2] !== '--destination' || args[4] !== '--receipt')
      throw new Error('usage: --source PATH --destination NEW_PATH --receipt NEW_PATH')
    const result = prepareNativePatch13({ source: args[1], destination: args[3], receipt: args[5] })
    console.log(
      JSON.stringify({
        status: result.status,
        sourceFileCount: result.sourceFileCount,
        sourceInventorySha256: result.sourceInventorySha256,
        nativeExecution: false,
        runtimeQualified: false,
      }),
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
