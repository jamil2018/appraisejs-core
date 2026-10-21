#!/usr/bin/env node
// Additive bundle selection only; preserve the exact generic preparer10 contract.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareNativePatch } from './m06-native-patch-10.mjs'

export const bundle11 = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../tasks/codex-app-server-journeys/m06-native-patch-11',
)

export function prepareNativePatch11(options) {
  return prepareNativePatch({ ...options, bundle: bundle11 })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 6 || args[0] !== '--source' || args[2] !== '--destination' || args[4] !== '--receipt') {
      throw new Error('usage: --source PATH --destination NEW_PATH --receipt NEW_PATH')
    }
    console.log(
      JSON.stringify(prepareNativePatch11({ source: args[1], destination: args[3], receipt: args[5] }), null, 2),
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
