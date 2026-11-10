import assert from 'node:assert/strict'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { parseNativePatchArguments, runNativePatchCli, formatNativePatchSummary } from '../m06-native-patch-cli.mjs'

test('offline assembler CLI preserves the exact three path values', () => {
  assert.deepEqual(
    parseNativePatchArguments(['--source', '/source path', '--destination', '/new', '--receipt', '/receipt']),
    {
      source: '/source path',
      destination: '/new',
      receipt: '/receipt',
    },
  )
})
test('offline assembler CLI refuses omitted, extra, reordered and unknown flags', () => {
  for (const args of [
    [],
    ['--source', '/s', '--destination', '/d'],
    ['--source', '/s', '--destination', '/d', '--receipt', '/r', 'extra'],
    ['--receipt', '/r', '--destination', '/d', '--source', '/s'],
    ['--unknown', '/s', '--destination', '/d', '--receipt', '/r'],
  ]) {
    assert.throws(() => parseNativePatchArguments(args), /usage:/)
  }
})
test('importing a source assembler CLI cannot invoke its preparation function', () => {
  runNativePatchCli(new URL('../m06-native-patch-11.mjs', import.meta.url).href, () => {
    assert.fail('Imported assembler must remain inert')
  })
})

// Exercise the real CLI path with an inert preparer, including both public output contracts.
test('shared CLI preserves complete pretty output and versioned compact summaries', () => {
  const originalArgv = process.argv
  const originalLog = console.log
  const output = []
  const result = {
    status: 'PREPARED_SOURCE_ONLY',
    sourceFileCount: 9176,
    sourceInventorySha256: 'abc',
    retained: { path: '/new source' },
  }
  const options = { source: '/input', destination: '/new source', receipt: '/receipt' }
  try {
    process.argv = [
      originalArgv[0],
      '/inert-source-assembler.mjs',
      '--source',
      options.source,
      '--destination',
      options.destination,
      '--receipt',
      options.receipt,
    ]
    console.log = value => output.push(value)
    const prepare = actual => {
      assert.deepEqual(actual, options)
      return result
    }
    runNativePatchCli(pathToFileURL(process.argv[1]).href, prepare)
    runNativePatchCli(pathToFileURL(process.argv[1]).href, prepare, formatNativePatchSummary)
    assert.deepEqual(JSON.parse(output[0]), result)
    assert.match(output[0], /\n  "status"/)
    assert.deepEqual(JSON.parse(output[1]), {
      status: result.status,
      sourceFileCount: 9176,
      sourceInventorySha256: 'abc',
      nativeExecution: false,
      runtimeQualified: false,
    })
    assert.equal(output[1].includes('\n'), false)
  } finally {
    process.argv = originalArgv
    console.log = originalLog
  }
})
