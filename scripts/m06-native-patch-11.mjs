#!/usr/bin/env node
// Additive bundle selection only; preserve the exact generic preparer10 contract.
import { runNativePatchCli } from './m06-native-patch-cli.mjs'
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

runNativePatchCli(import.meta.url, prepareNativePatch11)
