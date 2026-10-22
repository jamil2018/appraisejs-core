// Offline artifact preparation only. Never imports the generated client or opens a database.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bindingFileRecord, materializeGeneratedClient } from './source-custody-client-binding.mjs'

export const root = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'))
const require = createRequire(path.join(root, 'package.json'))
export const digest = value => createHash('sha256').update(value).digest('hex')
export const fileRecord = filename => ({
  filename,
  sha256: digest(readFileSync(filename)),
  bytes: readFileSync(filename).length,
})
export function tree(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const filename = path.join(directory, entry.name)
      return entry.isDirectory() ? tree(filename) : [fileRecord(filename)]
    })
}
export function cleanEnvironment(directory) {
  for (const name of ['home', 'tmp', 'npm-cache']) mkdirSync(path.join(directory, name), { recursive: true })
  for (const name of ['user.npmrc', 'global.npmrc']) writeFileSync(path.join(directory, name), '', { flag: 'wx' })
  const engines = path.dirname(require.resolve('@prisma/engines/package.json'))
  return {
    PATH: path.dirname(process.execPath) + ':/usr/bin:/bin:/usr/sbin:/sbin',
    HOME: path.join(directory, 'home'),
    TMPDIR: path.join(directory, 'tmp'),
    LANG: 'en_US.UTF-8',
    NODE_ENV: 'test',
    NO_COLOR: '1',
    PRISMA_SCHEMA_ENGINE_BINARY: path.join(engines, 'schema-engine-darwin-arm64'),
    PRISMA_QUERY_ENGINE_LIBRARY: path.join(engines, 'libquery_engine-darwin-arm64.dylib.node'),
    PRISMA_GENERATE_SKIP_AUTOINSTALL: '1',
    PRISMA_HIDE_UPDATE_MESSAGE: '1',
    CHECKPOINT_DISABLE: '1',
    npm_config_offline: 'true',
    npm_config_cache: path.join(directory, 'npm-cache'),
    npm_config_userconfig: path.join(directory, 'user.npmrc'),
    npm_config_globalconfig: path.join(directory, 'global.npmrc'),
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
  }
}
function installedInputs() {
  const installed = path.dirname(require.resolve('prisma/package.json'))
  const modules = path.dirname(installed)
  return [
    ...[
      path.join(root, 'package-lock.json'),
      path.join(modules, '.package-lock.json'),
      require.resolve('@prisma/client/package.json'),
      require.resolve('prisma/package.json'),
    ].map(fileRecord),
    ...tree(path.join(modules, '.prisma/client')),
  ]
}
function pinnedGeneratorTools() {
  const cli = require.resolve('prisma/build/index.js'),
    directory = path.dirname(cli)
  const expected = [
    [realpathSync(process.execPath), '02dc8fa00d7f857c2412a5d55a85a1b7a341e94c3df430bd8733c732e31dca46'],
    [cli, 'c2a77456b70e8ba1e640e122824ed694433828a7c0d76ff3db7fc376b4b0e1a0'],
    [
      path.join(directory, 'prisma_schema_build_bg.wasm'),
      'bca8b35bd5ebe0164323d5f761a7a5075fa6ad00e1dfc7906e9da5d4c13c0287',
    ],
    [
      path.resolve(directory, '../prisma-client/generator-build/index.js'),
      'b504707b44017c90f90bd74b9eddeb0d07bd13491bbb33e29ef2c3d9d898121c',
    ],
    [require.resolve('prisma/package.json'), '640c40516faa0c333995d0e22cf9e09815c3d7f80ef71ac793283d2c9cac41be'],
    [
      require.resolve('@prisma/client/package.json'),
      '219e507d9671f4d8bcf6161274201015bd97aaaff76eb464b8de7ab624f1beba',
    ],
  ]
  return expected.map(([filename, expectedSha256]) => {
    const actual = fileRecord(filename)
    assert.equal(actual.sha256, expectedSha256, 'Pinned installed generator changed; exact review required')
    return actual
  })
}
function formatterProvenance(directory, inputSchema, generatedSchema, executable, cli, env, protectedBefore) {
  const formatter = path.join(directory, 'formatter')
  mkdirSync(formatter)
  const filename = path.join(formatter, 'schema.prisma'),
    config = path.join(formatter, 'prisma.config.cjs')
  writeFileSync(filename, inputSchema, { flag: 'wx' })
  writeFileSync(config, 'module.exports = {}\n', { flag: 'wx' })
  const args = [cli, 'format', '--schema', filename, '--config', config]
  writeFileSync(
    path.join(formatter, 'consumed.json'),
    JSON.stringify(
      {
        executable: fileRecord(executable),
        args,
        cwd: formatter,
        inputSchemaSha256: digest(inputSchema),
        config: fileRecord(config),
        envKeys: Object.keys(env).sort(),
        status: 'CONSUMED_SEPARATE_PINNED_FORMATTER_NO_RETRY',
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  )
  const actual = spawnSync(executable, args, { cwd: formatter, env, encoding: 'utf8', maxBuffer: 1024 * 1024 })
  writeFileSync(path.join(formatter, 'stdout'), actual.stdout ?? '', { flag: 'wx' })
  writeFileSync(path.join(formatter, 'stderr'), actual.stderr ?? '', { flag: 'wx' })
  const result = {
    exit: actual.status,
    signal: actual.signal,
    error: actual.error?.message,
    exactFormatterOutputEqualsGeneratedSchema: readFileSync(filename).equals(Buffer.from(generatedSchema)),
    formatterOutput: fileRecord(filename),
    generatedSchemaSha256: digest(generatedSchema),
    protectedAfter: installedInputs(),
    oldByteAndTokenGuards: 'SEPARATE_PRESERVED_FAILURES_NOT_RELABELED',
    acceptanceMechanism: 'EXACT_PINNED_INSTALLED_FORMATTER_OUTPUT_BYTES_NO_NORMALIZATION',
  }
  writeFileSync(path.join(formatter, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  assert(!actual.error && actual.status === 0 && actual.signal === null, 'Pinned offline formatter failed; no fallback')
  assert(result.exactFormatterOutputEqualsGeneratedSchema, 'Unexplained generated schema bytes; exact review required')
  assert.deepEqual(result.protectedAfter, protectedBefore)
  return result
}
export function generateOwnedClient(directory) {
  assert(path.isAbsolute(directory) && !existsSync(directory), 'New absolute generation attempt required')
  mkdirSync(directory, { recursive: true })
  const generation = path.join(directory, 'generation'),
    output = path.join(directory, 'generated-client')
  mkdirSync(generation)
  const canonicalSchema = readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8')
  assert(
    canonicalSchema.startsWith('generator client {\n  provider = "prisma-client-js"\n}\n'),
    'Canonical generator block changed; review required',
  )
  assert.equal((canonicalSchema.match(/generator client \{/g) ?? []).length, 1)
  const outputLine = `  output = ${JSON.stringify(output)}\n`
  const schema = canonicalSchema.replace('generator client {\n', 'generator client {\n' + outputLine)
  assert.equal(schema.replace(outputLine, ''), canonicalSchema)
  const schemaFile = path.join(generation, 'schema.prisma'),
    config = path.join(generation, 'prisma.config.cjs')
  writeFileSync(schemaFile, schema, { flag: 'wx' })
  writeFileSync(config, 'module.exports = {}\n', { flag: 'wx' })
  const env = cleanEnvironment(directory)
  const expectedEngines = {
    PRISMA_SCHEMA_ENGINE_BINARY: 'caa2cf90d5b2cfe6cc06e47974f7e3275dd395b4d35cf140d5d4b2362c3b5bb1',
    PRISMA_QUERY_ENGINE_LIBRARY: 'afb9cb5a12ea42caa6f6498e40e9cb75059cae17098aadcc1001c99bb262e1ee',
  }
  for (const [key, expected] of Object.entries(expectedEngines)) assert.equal(fileRecord(env[key]).sha256, expected)
  for (const name of ['prisma', '@prisma/client', '@prisma/engines'])
    assert.equal(JSON.parse(readFileSync(require.resolve(name + '/package.json'))).version, '6.19.3')
  const migrationFiles = tree(path.join(root, 'prisma/migrations')).filter(row =>
    row.filename.endsWith('/migration.sql'),
  )
  assert.equal(migrationFiles.length, 93, 'Review required if canonical migration inventory changes')
  const executable = realpathSync(process.execPath),
    cli = require.resolve('prisma/build/index.js')
  const generatorTools = pinnedGeneratorTools()
  const args = [cli, 'generate', '--schema', schemaFile, '--config', config]
  const before = installedInputs()
  const inputs = {
    executable: fileRecord(executable),
    nodeVersion: process.version,
    cli: fileRecord(cli),
    generatorTools,
    args,
    cwd: generation,
    envKeys: Object.keys(env).sort(),
    schema: fileRecord(schemaFile),
    canonicalSchemaSha256: digest(canonicalSchema),
    config: fileRecord(config),
    migrations: migrationFiles,
    inventory: fileRecord(path.join(root, 'prisma/migration-inventory.json')),
    engines: Object.keys(expectedEngines).map(key => fileRecord(env[key])),
    installedBefore: before,
    status: 'CONSUMED_OFFLINE_GENERATION_NO_RETRY',
  }
  writeFileSync(path.join(directory, 'generation-inputs.json'), JSON.stringify(inputs, null, 2) + '\n', { flag: 'wx' })
  const actual = spawnSync(executable, args, { cwd: generation, env, encoding: 'utf8', maxBuffer: 1024 * 1024 })
  writeFileSync(path.join(directory, 'generation.stdout'), actual.stdout ?? '', { flag: 'wx' })
  writeFileSync(path.join(directory, 'generation.stderr'), actual.stderr ?? '', { flag: 'wx' })
  const after = installedInputs()
  const result = {
    status: actual.status,
    signal: actual.signal,
    error: actual.error?.message,
    installedAfter: after,
    outputFiles: tree(output),
    unchangedInstalled: JSON.stringify(before) === JSON.stringify(after),
  }
  writeFileSync(path.join(directory, 'generation-result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  assert.deepEqual(after, before, 'Installed client/lock metadata changed; no fallback')
  assert(
    !actual.error && actual.status === 0 && actual.signal === null,
    'Owned offline generation failed; attempt preserved',
  )
  assert.equal(readFileSync(schemaFile, 'utf8'), schema, 'Generation input changed')
  const generatedSchema = readFileSync(path.join(output, 'schema.prisma'), 'utf8')
  const formatter = formatterProvenance(directory, schema, generatedSchema, executable, cli, env, before)
  assert.deepEqual(tree(output), result.outputFiles, 'Formatter changed original generation outputs')
  assert.deepEqual(pinnedGeneratorTools(), generatorTools)
  assert.equal(readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8'), canonicalSchema)
  assert.equal(JSON.parse(readFileSync(path.join(output, 'package.json'))).version, '6.19.3')
  assert.equal(
    fileRecord(path.join(output, 'libquery_engine-darwin-arm64.dylib.node')).sha256,
    expectedEngines.PRISMA_QUERY_ENGINE_LIBRARY,
  )
  const entry = path.join(output, 'index.js'),
    code = readFileSync(entry, 'utf8')
  const inline = code.match(/"inlineSchema": ("(?:[^"\\]|\\.)*")/)
  assert(inline && JSON.parse(inline[1]) === generatedSchema, 'Owned Node client inline schema mismatch')
  assert(code.includes("require('./runtime/library.js')"), 'Owned Node/library runtime required')
  const clientBinding = materializeGeneratedClient(directory, {
    kind: 'OWNED_GENERATION',
    originalDirectory: output,
    canonicalSchema: bindingFileRecord(path.join(root, 'prisma/schema.prisma')),
    receipts: [
      'generation-inputs.json',
      'generation-result.json',
      'generation/schema.prisma',
      'formatter/consumed.json',
      'formatter/result.json',
      'formatter/schema.prisma',
    ].map(name => bindingFileRecord(path.join(directory, name))),
  })
  return { entry: clientBinding.entry, generationEntry: entry, clientBinding, inputs, result, formatter }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3)
  const prepared = generateOwnedClient(path.resolve(process.argv[2]))
  console.log(
    JSON.stringify({
      entry: prepared.entry,
      status: prepared.result.status,
      outputFiles: prepared.result.outputFiles.length,
    }),
  )
}
