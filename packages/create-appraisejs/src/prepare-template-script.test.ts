import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, it } from 'vitest'

// Inspect the real private function without importing the preparation entrypoint.
const filename = fileURLToPath(new URL('../scripts/prepare-template.ts', import.meta.url))
const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true)
const declaration = source.statements.find(
  statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'runTypeScriptScript',
)
assert.ok(declaration && ts.isFunctionDeclaration(declaration))
const executable = ts.transpileModule(declaration.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText

type ProcessCall = [string, string[], string, Record<string, string>]
function actualFunction(runProcess: (...args: ProcessCall) => Promise<void>) {
  return runInNewContext(`${executable}\nrunTypeScriptScript`, {
    runProcess,
    getTsxCliPath: () => '/inert/tsx/cli.mjs',
    getTsNodeLoaderPath: () => '/inert/ts-node/esm.mjs',
    pathToFileURL,
    console: { warn: () => {} },
    process: { execPath: '/inert/node' },
    path,
  }) as (entry: string, cwd: string) => Promise<void>
}

describe('canonical template sync loader', () => {
  it('invokes TSX exactly once with the copied workspace configuration', async () => {
    const calls: ProcessCall[] = []
    const execute = actualFunction(async (...args) => {
      calls.push(args)
    })
    await execute('scripts/sync-step-definitions.ts', '/inert/copied-workspace')
    // Compare across the VM realm using the actual wire-like array values.
    assert.equal(
      JSON.stringify(calls),
      JSON.stringify([
        [
          '/inert/node',
          ['/inert/tsx/cli.mjs', 'scripts/sync-step-definitions.ts'],
          '/inert/copied-workspace',
          { TSX_TSCONFIG_PATH: '/inert/copied-workspace/tsconfig.json' },
        ],
      ]),
    )
  })

  for (const phase of ['loader startup', 'after partial script writes'])
    it(`propagates the original ${phase} rejection without replay`, async () => {
      const failure = new Error(phase)
      let attempts = 0
      const execute = actualFunction(async () => {
        attempts++
        throw failure
      })
      await assert.rejects(
        execute('scripts/sync-step-definitions.ts', '/inert/copied-workspace'),
        error => error === failure,
      )
      assert.equal(attempts, 1)
    })
})
