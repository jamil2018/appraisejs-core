// Shared CLI contract for the five offline source assemblers. No assembly runs on import.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const flags = ['--source', '--destination', '--receipt']
export function parseNativePatchArguments(args) {
  if (args.length !== flags.length * 2 || flags.some((flag, index) => args[index * 2] !== flag))
    throw new Error('usage: --source PATH --destination NEW_PATH --receipt NEW_PATH')
  return { source: args[1], destination: args[3], receipt: args[5] }
}

function formatComplete(result) {
  return JSON.stringify(result, null, 2)
}
export function formatNativePatchSummary(result) {
  return JSON.stringify({
    status: result.status,
    sourceFileCount: result.sourceFileCount,
    sourceInventorySha256: result.sourceInventorySha256,
    nativeExecution: false,
    runtimeQualified: false,
  })
}
export function runNativePatchCli(moduleUrl, prepare, format = formatComplete) {
  if (!process.argv[1] || path.resolve(process.argv[1]) !== fileURLToPath(moduleUrl)) return
  try {
    console.log(format(prepare(parseNativePatchArguments(process.argv.slice(2)))))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
