import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const evidenceRoot = path.join(root, '.appraisejs/m12-evidence')
mkdirSync(evidenceRoot, { recursive: true })
const runRoot = mkdtempSync(path.join(evidenceRoot, 'run-'))
const artifacts = path.join(runRoot, 'artifacts')
const prefix = path.join(runRoot, 'install-prefix')
const scaffoldCwd = path.join(runRoot, 'scaffold-cli-cwd')
mkdirSync(artifacts)
mkdirSync(prefix)
mkdirSync(scaffoldCwd)

function commandResultRecord(command, args, cwd, result) {
  return {
    command,
    args,
    cwd,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error?.message,
  }
}

function assertCommandStatus(record, expectedStatus = 0) {
  if (record.status === expectedStatus) return
  const error = new Error(`${record.command} ${record.args.join(' ')} failed with status ${record.status}`)
  error.evidence = record
  throw error
}

function run(command, args, { cwd = root, env = {}, input, name = 'command', expectedStatus = 0 } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: path.join(evidenceRoot, 'npm-cache'),
      ...env,
    },
    input,
    maxBuffer: 16 * 1024 * 1024,
  })
  const record = commandResultRecord(command, args, cwd, result)
  writeFileSync(path.join(runRoot, `${name}-${Date.now()}.json`), JSON.stringify(record, null, 2))
  if (result.error) throw result.error
  assertCommandStatus(record, expectedStatus)
  return result
}

function packageArtifact(packageDirectory) {
  const result = run('npm', ['pack', '--json', '--pack-destination', artifacts], {
    cwd: path.join(root, packageDirectory),
    name: `pack-${path.basename(packageDirectory)}`,
  })
  const [{ filename }] = JSON.parse(result.stdout)
  return path.join(artifacts, filename)
}

function sqlite(pathname) {
  return new DatabaseSync(pathname)
}

function hashFile(filename) {
  return createHash('sha256').update(readFileSync(filename)).digest('hex')
}

function assertSeedClean(databasePath) {
  const db = sqlite(databasePath)
  try {
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map(row => row.name),
    )
    assert.ok(tables.has('_prisma_migrations'), 'seed must include Prisma migration history')
    const forbiddenTables = [
      'QualityJourney',
      'QualityJourneyWorkItem',
      'QualityJourneyWorkAttempt',
      'QualityJourneyEvent',
      'QualityJourneyCoordinatorSession',
      'TestRun',
      'TestRunReport',
      'TestRunTestCase',
    ]
    for (const table of forbiddenTables) {
      if (!tables.has(table)) continue
      const [{ count }] = db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).all()
      assert.equal(count, 0, `seed must not include ${table} rows`)
    }
    const migrations = db
      .prepare('SELECT migration_name, checksum, finished_at FROM _prisma_migrations')
      .all()
      .map(row => ({ ...row }))
    assert.ok(migrations.length > 0, 'seed migration history must be populated')
    assert.ok(
      migrations.every(row => row.finished_at && row.checksum),
      'seed migration history must be complete',
    )
  } finally {
    db.close()
  }
}

function scaffold(template, name) {
  const target = path.join(scaffoldCwd, name)
  const projectModule = pathToFileURL(path.join(prefix, 'node_modules/create-appraisejs/dist/create-project.js')).href
  const driver = path.join(runRoot, 'scaffold-driver.mjs')
  writeFileSync(
    driver,
    `import { createProject } from ${JSON.stringify(projectModule)}\n` +
      `await createProject({ directory: process.argv[2], template: process.argv[3], packageManager: 'npm', runInstall: false, playwrightBrowsers: [] })\n`,
  )
  run('node', [driver, target, template], { cwd: scaffoldCwd, name: `scaffold-${template}` })
  assert.ok(readFileSync(path.join(target, 'package.json'), 'utf8').includes('"name": "appraise"'))
  assertSeedClean(path.join(target, 'prisma/dev.db'))
  return target
}

function createCodexStub(binDirectory, marketplaceRoot, expectedPluginVersion) {
  mkdirSync(binDirectory, { recursive: true })
  const executable = path.join(binDirectory, 'codex')
  writeFileSync(
    executable,
    `#!/usr/bin/env node\n` +
      `const args = process.argv.slice(2);\n` +
      `if (args[0] === '--version') process.stdout.write('codex-cli 99.0.0\\n');\n` +
      `else if (args[0] === 'plugin' && args[1] === 'list') process.stdout.write(JSON.stringify({installed:[{name:'appraise-quality-journey',marketplaceName:'appraise-local',version:${JSON.stringify(expectedPluginVersion)},enabled:true}]}));\n` +
      `else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') process.stdout.write(JSON.stringify({marketplaces:[{name:'appraise-local',root:${JSON.stringify(marketplaceRoot)}}]}));\n` +
      `else if (args[0] === 'mcp' && args[1] === 'get') process.stdout.write(JSON.stringify({enabled:false,transport:{type:'stdio',command:'appraisejs'}}));\n` +
      `else process.exit(2);\n`,
  )
  chmodSync(executable, 0o755)
  return binDirectory
}

function verifyCompatibilityFailsClosed(appraiseCli, marketplaceRoot, runTag) {
  const bin = createCodexStub(
    path.join(runRoot, `codex-stub-${runTag}`),
    marketplaceRoot,
    `${JSON.parse(readFileSync(path.join(root, 'packages/appraisejs/package.json'), 'utf8')).version}+codex.c12-20261003`,
  )
  const result = run('node', [appraiseCli, 'agent', 'compatibility', '--json'], {
    cwd: scaffoldCwd,
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    expectedStatus: 1,
    name: `compatibility-refusal-${runTag}`,
  })
  const readiness = JSON.parse(result.stdout)
  assert.equal(readiness.readyForFreshTask, false)
  assert.equal(readiness.checks.find(check => check.id === 'codex_version')?.status, 'unknown')
  assert.equal(readiness.checks.find(check => check.id === 'mcp_registration')?.status, 'error')
  assert.equal(readiness.connectedJourney, false)
  assert.equal(readiness.lifecycleAuthority, false)
}

function seedPredecessorDatabase(project, databasePath = path.join(project, 'prisma/predecessor-upgrade.db')) {
  const db = sqlite(databasePath)
  try {
    db.exec('PRAGMA foreign_keys=ON')
    db.exec('CREATE TABLE "_M12EvidenceSentinel" (value TEXT NOT NULL)')
    db.prepare('INSERT INTO "_M12EvidenceSentinel" (value) VALUES (?)').run('preserve-this-record')
    db.exec(`
      CREATE TABLE "_prisma_migrations" (
        id TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL, finished_at DATETIME,
        migration_name TEXT NOT NULL, logs TEXT, rolled_back_at DATETIME,
        started_at DATETIME NOT NULL DEFAULT current_timestamp,
        applied_steps_count INTEGER UNSIGNED NOT NULL DEFAULT 0
      )
    `)
    const inventory = JSON.parse(readFileSync(path.join(project, 'prisma/migration-inventory.json'), 'utf8')).migrations
    for (const migration of inventory.slice(0, -1)) {
      db.exec('BEGIN')
      try {
        db.exec(readFileSync(path.join(project, 'prisma/migrations', migration.name, 'migration.sql'), 'utf8'))
        db.prepare(
          `
          INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, started_at, applied_steps_count)
          VALUES (?, ?, ?, ?, ?, 1)
        `,
        ).run(
          migration.name,
          migration.checksum,
          migration.name,
          '2026-11-12T00:00:00.000Z',
          '2026-11-12T00:00:00.000Z',
        )
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    }
  } finally {
    db.close()
  }
}

function assertCompletedMigrationHistory(
  project,
  { databasePath = path.join(project, 'prisma/dev.db'), sentinel = true } = {},
) {
  const db = sqlite(databasePath)
  try {
    const rows = db
      .prepare('SELECT migration_name, checksum, finished_at FROM _prisma_migrations ORDER BY migration_name')
      .all()
    const inventory = JSON.parse(readFileSync(path.join(project, 'prisma/migration-inventory.json'), 'utf8')).migrations
    assert.equal(rows.length, inventory.length)
    assert.ok(
      rows.every(
        row =>
          row.finished_at && inventory.some(item => item.name === row.migration_name && item.checksum === row.checksum),
      ),
    )
    if (sentinel) {
      assert.deepEqual(
        db
          .prepare('SELECT value FROM "_M12EvidenceSentinel"')
          .all()
          .map(row => ({ ...row })),
        [{ value: 'preserve-this-record' }],
      )
    }
  } finally {
    db.close()
  }
}

function createModernExternalOwnershipFixture(project, databasePath) {
  const clientModule = pathToFileURL(path.join(project, 'node_modules/@prisma/client/index.js')).href
  const driver = path.join(runRoot, 'create-modern-external-history.mjs')
  writeFileSync(
    driver,
    `import { PrismaClient } from ${JSON.stringify(clientModule)}\n` +
      `const client = new PrismaClient({ datasources: { db: { url: 'file:' + process.argv[2] } } })\n` +
      `try {\n` +
      `await client.targetProject.create({ data: { id:'m12-downgrade-target', kind:'LOCAL_WORKSPACE', canonicalIdentity:'path:/m12-downgrade-target', canonicalPath:'/m12-downgrade-target', displayName:'M12 downgrade witness', fingerprint:'sha256:m12-downgrade-target' } })\n` +
      `await client.qualityJourney.create({ data: { id:'m12-downgrade-journey', targetProjectId:'m12-downgrade-target', rootIdempotencyKey:'m12-downgrade-root', rootRequestHash:'sha256:m12-downgrade-root', hostingMode:'EXTERNAL_LEGACY', hostingContractVersion:2, hostingProvenance:'EXPLICIT_HOSTING_TRANSFER_V1', ownershipVersion:2, activeCycleId:'m12-downgrade-cycle', stateHash:'sha256:m12-downgrade-state' } })\n` +
      `await client.qualityJourneyCycle.create({ data: { id:'m12-downgrade-cycle', journeyId:'m12-downgrade-journey', sequence:1 } })\n` +
      `const transferTime = new Date('2026-11-12T00:00:00.000Z')\n` +
      `await client.qualityJourneyCoordinatorSession.create({ data: { id:'m12-downgrade-managed-session', journeyId:'m12-downgrade-journey', targetProjectId:'m12-downgrade-target', ownerPrincipalId:'project:m12-human', hostKind:'APP_SERVER_LOCAL_V1', status:'FENCED', generation:1, registrationKey:'m12-managed', registrationRequestHash:'sha256:m12-managed-request', provenance:'REGISTERED_INTERNAL_V1', fencedAt:transferTime, fenceReason:'EXPLICIT_HOSTING_TRANSFER_V1' } })\n` +
      `await client.qualityJourneyCoordinatorSession.create({ data: { id:'m12-downgrade-external-session', journeyId:'m12-downgrade-journey', targetProjectId:'m12-downgrade-target', ownerPrincipalId:'project:foreign', hostKind:'EXTERNAL_LEGACY', status:'ACTIVE', generation:2, registrationKey:'m12-external', registrationRequestHash:'sha256:m12-external-request', predecessorSessionId:'m12-downgrade-managed-session', provenance:'EXPLICIT_HOSTING_TRANSFER_V1', activatedAt:transferTime } })\n` +
      `await client.qualityJourney.update({ where:{id:'m12-downgrade-journey'}, data:{ currentCoordinatorSessionId:'m12-downgrade-external-session' } })\n` +
      `process.stdout.write(JSON.stringify(await client.qualityJourney.findUniqueOrThrow({ where:{id:'m12-downgrade-journey'}, include:{currentCoordinatorSession:true,coordinatorSessions:true} })))\n` +
      `} finally { await client.$disconnect() }\n`,
  )
  const result = run('node', [driver, databasePath], { cwd: project, name: 'seed-modern-external-ownership' })
  const journey = JSON.parse(result.stdout)
  assert.equal(journey.hostingContractVersion, 2)
  assert.equal(journey.hostingMode, 'EXTERNAL_LEGACY')
  assert.equal(journey.currentCoordinatorSession.ownerPrincipalId, 'project:foreign')
  assert.equal(journey.coordinatorSessions.length, 2)
}

function materializeM11Application(databasePath, installedDependencies) {
  const legacyRoot = path.join(runRoot, 'm11-legacy-app')
  const archive = path.join(runRoot, 'm11-base-8d8d8254.tar')
  const archivePaths = [
    'package.json',
    'scripts/migrate-compatible.mjs',
    'scripts/start-local.mjs',
    'scripts/lib/database-compatibility.mjs',
    'scripts/lib/migration-inventory.mjs',
    'scripts/lib/local-startup.mjs',
    'scripts/lib/built-in-readiness.mjs',
    'scripts/lib/runtime-readiness.mjs',
    'scripts/lib/operation-handler-source-readiness.mjs',
    'prisma/schema.prisma',
    'prisma/migration-inventory.json',
    'prisma/migrations',
  ]
  mkdirSync(legacyRoot)
  run('git', ['archive', '--format=tar', '--output', archive, '8d8d8254', ...archivePaths], {
    name: 'archive-exact-m11-application',
  })
  run('tar', ['-xf', archive, '-C', legacyRoot], { name: 'extract-exact-m11-application' })
  symlinkSync(installedDependencies, path.join(legacyRoot, 'node_modules'), 'dir')
  const oldInventory = JSON.parse(readFileSync(path.join(legacyRoot, 'prisma/migration-inventory.json'), 'utf8'))
  assert.equal(oldInventory.migrations.length, 97)
  copyFileSync(databasePath, path.join(legacyRoot, 'prisma/m12-modern-external.db'))
  return {
    legacyRoot,
    databasePath: path.join(legacyRoot, 'prisma/m12-modern-external.db'),
    env: { DATABASE_URL: 'file:m12-modern-external.db' },
  }
}

function verifyM11RefusesM12ExternalDatabase(project, databasePath) {
  const legacy = materializeM11Application(databasePath, path.join(project, 'node_modules'))
  const legacyInventory = JSON.parse(
    readFileSync(path.join(legacy.legacyRoot, 'prisma/migration-inventory.json'), 'utf8'),
  )
  const modernDb = sqlite(legacy.databasePath)
  try {
    const migrationRows = modernDb
      .prepare('SELECT migration_name FROM _prisma_migrations ORDER BY migration_name')
      .all()
      .map(row => row.migration_name)
    assert.equal(migrationRows.length, 98)
    assert.equal(migrationRows.length, legacyInventory.migrations.length + 1)
    const external = modernDb
      .prepare(
        `SELECT journey.hostingMode, journey.hostingContractVersion, session.ownerPrincipalId
         FROM QualityJourney AS journey
         JOIN QualityJourneyCoordinatorSession AS session
           ON session.id = journey.currentCoordinatorSessionId
         WHERE journey.id = ?`,
      )
      .get('m12-downgrade-journey')
    assert.deepEqual(
      { ...external },
      {
        hostingMode: 'EXTERNAL_LEGACY',
        hostingContractVersion: 2,
        ownerPrincipalId: 'project:foreign',
      },
    )
  } finally {
    modernDb.close()
  }
  const bytesBefore = hashFile(legacy.databasePath)
  for (const [name, command] of [
    ['m11-migrate-db-downgrade-refusal', ['npm', 'run', 'migrate-db']],
    ['m11-startup-downgrade-refusal', ['node', 'scripts/start-local.mjs', 'start']],
  ]) {
    const result = run(command[0], command.slice(1), {
      cwd: legacy.legacyRoot,
      env: legacy.env,
      expectedStatus: 1,
      name,
    })
    assert.match(`${result.stdout}\n${result.stderr}`, /unknown or changed migration.*Downgrade refused/)
    assert.equal(hashFile(legacy.databasePath), bytesBefore, `${name} must not modify the M12 database`)
  }
}

function verifyInstalledCapsuleRuntime(project) {
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: project,
    name: 'install-generated-app-runtime-dependencies',
  })
  run('node', ['scripts/build-cucumber-runtime.mjs'], { cwd: project, name: 'build-installed-app-cucumber-runtime' })
  const target = path.join(project, 'target-with-decoy-node-modules')
  const output = path.join(project, 'capsule-output-with-decoy-node-modules')
  for (const directory of [target, output]) {
    const decoy = path.join(directory, 'node_modules/@appraise/cucumber-runtime')
    mkdirSync(decoy, { recursive: true })
    writeFileSync(
      path.join(decoy, 'package.json'),
      JSON.stringify({ name: '@appraise/cucumber-runtime', version: 'decoy' }),
    )
    writeFileSync(path.join(decoy, 'index.js'), 'export const decoy = true\n')
  }
  const driver = path.join(runRoot, 'seal-runtime-driver.mjs')
  const sealer = pathToFileURL(path.join(project, 'src/lib/runtime-capsule/command-receipt-sealer.ts')).href
  const hash = character => `sha256:${character.repeat(64)}`
  writeFileSync(
    driver,
    `import { sealCapsuleCommandReceipt } from ${JSON.stringify(sealer)}\n` +
      `const cases = [{ validationId:'validation', suiteId:'suite', caseId:'case', scenarioId:'scenario' }]\n` +
      `const receipt = await sealCapsuleCommandReceipt({ operation:{id:'operation',operationHash:${JSON.stringify(hash('a'))},projectionHash:${JSON.stringify(hash('b'))},receiptHash:${JSON.stringify(hash('c'))},runtimeInputHash:${JSON.stringify(hash('d'))},targetProjectId:'target',validationHash:${JSON.stringify(hash('e'))}}, testRun:{id:'test-run',runId:'run',browserEngine:'CHROMIUM',environment:{id:'environment',name:'Environment',baseUrl:'https://example.test',username:null,passwordEnvironmentVariable:null,credentialState:'NONE'}}, runtimeInput:{extensionPolicy:{declarationHash:${JSON.stringify(hash('f'))},compilerVersion:'1'}}, built:{cases,files:[{path:'cucumber.mjs',role:'config',bytes:Buffer.from('export const config = true\\n')},{path:'features/a.feature',role:'feature',bytes:Buffer.from('Feature: A\\n')},{path:'bindings/a.mjs',role:'binding',bytes:Buffer.from('export const binding = true\\n')},{path:'support/world.mjs',role:'support',bytes:Buffer.from('export const world = true\\n')},{path:'support/hooks.mjs',role:'support',bytes:Buffer.from('export const hooks = true\\n')},{path:'expected-cases.json',role:'expected-cases',bytes:Buffer.from(JSON.stringify(cases))}]}})\n` +
      `process.stdout.write(JSON.stringify(receipt.runtime.moduleImports))\n`,
  )
  const imports = JSON.parse(
    run('node', ['--import', 'tsx', driver], { cwd: project, name: 'seal-installed-app-runtime' }).stdout,
  )
  const appraiseRuntimePath = path.join(project, 'packages/cucumber-runtime/dist/index.js')
  const appraiseHooksPath = path.join(project, 'packages/cucumber-runtime/dist/hooks.js')
  assert.ok(imports.some(item => item.resolvedRealPath === appraiseRuntimePath))
  assert.ok(imports.some(item => item.resolvedRealPath === appraiseHooksPath))
  assert.ok(
    imports.every(
      item =>
        !item.resolvedRealPath.includes('target-with-decoy') &&
        !item.resolvedRealPath.includes('capsule-output-with-decoy'),
    ),
  )
}

try {
  const appraiseTarball = packageArtifact('packages/appraisejs')
  const createTarball = packageArtifact('packages/create-appraisejs')
  run(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', prefix, appraiseTarball, createTarball],
    { name: 'install-packed-artifacts' },
  )

  const appraiseCli = path.join(prefix, 'node_modules/appraisejs/dist/cli.js')
  const createCli = path.join(prefix, 'node_modules/create-appraisejs/dist/cli.js')
  assert.match(
    run('node', [appraiseCli, '--help'], { cwd: scaffoldCwd, name: 'packed-appraise-help' }).stdout,
    /appraisejs/,
  )
  const marketplace = run('node', [appraiseCli, 'agent', 'plugin', 'path'], {
    cwd: scaffoldCwd,
    name: 'packed-marketplace-path',
  }).stdout.trim()
  assert.equal(marketplace, path.join(prefix, 'node_modules/appraisejs/codex-marketplace'))
  assert.ok(readFileSync(createCli, 'utf8').includes('Create Appraise'))
  verifyCompatibilityFailsClosed(appraiseCli, marketplace, 'installed')

  const blank = scaffold('blank', 'blank-project')
  const starter = scaffold('starter', 'starter-project')
  for (const project of [blank, starter]) {
    const manifest = JSON.parse(readFileSync(path.join(project, 'prisma/migration-inventory.json'), 'utf8'))
    assert.ok(Array.isArray(manifest.migrations) && manifest.migrations.length > 0)
    assert.ok(
      readFileSync(path.join(project, 'scripts/migrate-compatible.mjs'), 'utf8').includes(
        'assertDatabaseCompatibility',
      ),
    )
    assert.ok(
      readFileSync(path.join(project, 'scripts/lib/database-compatibility.mjs'), 'utf8').includes('Downgrade refused'),
    )
    const actual = readdirSync(path.join(project, 'prisma/migrations'), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
    assert.deepEqual(actual, manifest.migrations.map(entry => entry.name).sort())
  }

  const starterDb = path.join(starter, 'prisma/dev.db')
  const starterDbHash = hashFile(starterDb)
  run('node', [appraiseCli, 'agent', 'reconnect', '--cwd', starter, '--json'], {
    cwd: scaffoldCwd,
    name: 'installed-project-identity-connect',
  })
  const identityPath = path.join(starter, '.appraisejs/coordinator.json')
  const firstIdentity = JSON.parse(readFileSync(identityPath, 'utf8'))
  assert.equal(firstIdentity.token.length, 43)
  run('node', [appraiseCli, 'agent', 'disconnect', '--cwd', starter, '--json'], {
    cwd: scaffoldCwd,
    name: 'installed-project-identity-disconnect',
  })
  const disabledIdentity = JSON.parse(readFileSync(identityPath, 'utf8'))
  assert.equal(disabledIdentity.token, '')
  assert.equal(disabledIdentity.disabled, true)
  run('node', [appraiseCli, 'agent', 'reconnect', '--cwd', starter, '--json'], {
    cwd: scaffoldCwd,
    name: 'installed-project-identity-reconnect',
  })
  const secondIdentity = JSON.parse(readFileSync(identityPath, 'utf8'))
  assert.equal(secondIdentity.projectFingerprint, firstIdentity.projectFingerprint)
  assert.notEqual(secondIdentity.token, firstIdentity.token)
  assert.equal(
    hashFile(starterDb),
    starterDbHash,
    'identity disconnect/reconnect must preserve the scaffold database bytes',
  )

  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: blank,
    name: 'install-blank-app-dependencies',
  })
  run('npx', ['prisma', 'generate', '--schema', 'prisma/schema.prisma'], {
    cwd: blank,
    name: 'generate-blank-app-prisma-client',
  })
  const migrationEnv = { DATABASE_URL: 'file:cold-install.db' }
  run('npm', ['run', 'migrate-db'], { cwd: blank, env: migrationEnv, name: 'generated-fresh-database-init' })
  const coldDatabasePath = path.join(blank, 'prisma/cold-install.db')
  assertCompletedMigrationHistory(blank, { databasePath: coldDatabasePath, sentinel: false })
  createModernExternalOwnershipFixture(blank, coldDatabasePath)
  verifyM11RefusesM12ExternalDatabase(blank, coldDatabasePath)
  const upgradeDbPath = path.join(blank, 'prisma/predecessor-upgrade.db')
  const upgradeEnv = { DATABASE_URL: 'file:predecessor-upgrade.db' }
  seedPredecessorDatabase(blank, upgradeDbPath)
  run('npm', ['run', 'migrate-db'], { cwd: blank, env: upgradeEnv, name: 'generated-database-upgrade' })
  assertCompletedMigrationHistory(blank, { databasePath: upgradeDbPath })
  const futureDb = sqlite(upgradeDbPath)
  try {
    futureDb
      .prepare(
        `
      INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, started_at, applied_steps_count)
      VALUES (?, ?, ?, ?, ?, 1)
    `,
      )
      .run(
        'm12-future',
        'synthetic-future-checksum',
        '20991111999999_m12_future_fixture',
        '2026-11-12T00:00:00.000Z',
        '2026-11-12T00:00:00.000Z',
      )
  } finally {
    futureDb.close()
  }
  const futureBytes = hashFile(upgradeDbPath)
  run('npm', ['run', 'migrate-db'], {
    cwd: blank,
    env: upgradeEnv,
    expectedStatus: 1,
    name: 'generated-downgrade-refusal',
  })
  assert.equal(hashFile(upgradeDbPath), futureBytes, 'downgrade refusal must not modify the SQLite bytes')
  const futureCheck = sqlite(upgradeDbPath)
  try {
    assert.equal(
      futureCheck.prepare('SELECT migration_name FROM _prisma_migrations WHERE id = ?').get('m12-future')
        ?.migration_name,
      '20991111999999_m12_future_fixture',
    )
    assert.deepEqual(
      futureCheck
        .prepare('SELECT value FROM "_M12EvidenceSentinel"')
        .all()
        .map(row => ({ ...row })),
      [{ value: 'preserve-this-record' }],
    )
  } finally {
    futureCheck.close()
  }
  verifyInstalledCapsuleRuntime(starter)

  const sourceInventory = JSON.parse(readFileSync(path.join(root, 'prisma/migration-inventory.json'), 'utf8'))
  const templateInventory = JSON.parse(
    readFileSync(path.join(root, 'packages/create-appraisejs/templates/base/prisma/migration-inventory.json'), 'utf8'),
  )
  assert.deepEqual(templateInventory, sourceInventory, 'prepared scaffold migration inventory must match source')
  const exclusionsSource = path.join(root, 'src/lib/template-path-exclusions.ts')
  const exclusionsTemplate = path.join(
    root,
    'packages/create-appraisejs/templates/base/src/lib/template-path-exclusions.ts',
  )
  assert.equal(
    hashFile(exclusionsSource),
    hashFile(exclusionsTemplate),
    'prepared template exclusion source must match canonical source',
  )

  const outcome = {
    status: 'passed',
    artifactPaths: [appraiseTarball, createTarball],
    artifactSha256: { appraisejs: hashFile(appraiseTarball), createAppraisejs: hashFile(createTarball) },
    canonicalAndTemplateSha256: {
      templatePathExclusionsSource: hashFile(exclusionsSource),
      templatePathExclusionsTemplate: hashFile(exclusionsTemplate),
      migrationInventorySource: hashFile(path.join(root, 'prisma/migration-inventory.json')),
      migrationInventoryTemplate: hashFile(
        path.join(root, 'packages/create-appraisejs/templates/base/prisma/migration-inventory.json'),
      ),
      m12ProofScript: hashFile(fileURLToPath(import.meta.url)),
    },
    installedPrefix: prefix,
    foreignCwd: scaffoldCwd,
    scaffoldProjects: [blank, starter],
    claims: [
      'Both npm tarballs were installed into a fresh local prefix without global installation.',
      'Installed compatibility CLI refused an unknown Codex version and disabled MCP config using a fixed local stub only.',
      'Packed appraisejs resolves its marketplace relative to the installed package from a foreign cwd.',
      'Packed create-appraisejs compiled scaffold composer created blank and starter outputs from a foreign cwd; the installed CLI entrypoint was separately smoke-checked.',
      'Scaffold migration inventory matches source and migration directories; both seeds have complete history and no Journey or run records.',
      'A predecessor schema created from genuine migration SQL upgraded through the generated guarded command with its sentinel record and prior history retained.',
      'The generated guarded command initialized a truly missing SQLite file and applied all genuine migrations after local Prisma generation.',
      'Exact M11 source from base 8d8d8254 refused its own migrate-db and start-local startup against a genuinely migrated 98-entry M12 database with explicitly synthetic ownership-shape rows; no canonical transfer or valid authority is claimed for those rows. Both commands preserved database bytes.',
      'An explicit synthetic future-version fixture was refused with SQLite bytes and records preserved.',
      'Installed app runtime receipt resolved bundled Cucumber/runtime/hooks and ignored decoy target/output node_modules.',
      'Installed CLI disconnect/reconnect rotated the disposable scaffold credential while preserving the database bytes.',
    ],
    limitations: [
      'This does not execute a production mode transfer or Codex/provider/auth flow.',
      'This does not prove real host MCP task readiness or OS containment.',
      'No production mode transfer is exercised; this script proves packaging, runtime resolution, and local compatibility/storage refusal only.',
    ],
  }
  writeFileSync(path.join(runRoot, 'result.json'), JSON.stringify(outcome, null, 2))
  process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`)
} catch (error) {
  const outcome = {
    status: 'failed',
    failedAt: error?.message ?? String(error),
    evidenceDirectory: runRoot,
    commandEvidence: error?.evidence,
  }
  writeFileSync(path.join(runRoot, 'result.json'), JSON.stringify(outcome, null, 2))
  process.stderr.write(`${JSON.stringify(outcome, null, 2)}\n`)
  process.exitCode = 1
}
