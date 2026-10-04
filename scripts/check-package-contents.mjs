import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assertDatabaseMigrationParity, verifiedDatabaseMigrations } from './lib/migration-inventory.mjs'

const expectedMigrations = verifiedDatabaseMigrations(process.cwd())
const assertMigrationParity = cwd => assertDatabaseMigrationParity(cwd, expectedMigrations)

const packages = ['packages/appraisejs', 'packages/create-appraisejs']
const rootPackage = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8'))
if (rootPackage.private !== true) {
  console.error('The repository root must be private so npm refuses publication.')
  process.exit(1)
}
if (rootPackage.scripts?.prepublishOnly !== 'node scripts/refuse-root-publish.mjs') {
  console.error('The repository root must retain its explicit publish refusal lifecycle script.')
  process.exit(1)
}
const rootPublishRefusal = spawnSync(process.execPath, ['scripts/refuse-root-publish.mjs'], {
  cwd: path.resolve('.'),
  encoding: 'utf8',
})
if (rootPublishRefusal.status === 0) {
  console.error('The repository root publish refusal must exit non-zero.')
  process.exit(1)
}
const denied =
  /(?:^|\/)(?:\.appraise|\.playwright-cli)(?:\/|$)|(?:^|\/)automation\/(?:reports|logs|traces|screenshots)(?:\/|$)/i
const allowedDatabaseFixtures = new Set([
  'templates/flavors/blank/prisma/dev.db',
  'templates/flavors/starter/prisma/dev.db',
])

for (const packageDirectory of packages) {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: path.resolve(packageDirectory),
    encoding: 'utf8',
    env: { ...process.env, npm_config_cache: path.resolve('.tmp/npm-pack-cache') },
  })
  if (result.status !== 0) {
    process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }
  const [pack] = JSON.parse(result.stdout)
  const unsafe = pack.files
    .map(file => file.path)
    .filter(file => denied.test(file) || (file.endsWith('.db') && !allowedDatabaseFixtures.has(file)))
  if (unsafe.length > 0) {
    console.error(`${packageDirectory} contains forbidden package files:\n${unsafe.join('\n')}`)
    process.exit(1)
  }
  console.log(`${packageDirectory}: ${pack.files.length} bounded package files (${pack.size} bytes).`)
  if (packageDirectory === 'packages/create-appraisejs') {
    assertMigrationParity(path.resolve(packageDirectory, 'templates/base'))
    const temporary = mkdtempSync(path.join(tmpdir(), 'appraise-package-integrity-'))
    try {
      const packed = spawnSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], {
        cwd: path.resolve(packageDirectory),
        encoding: 'utf8',
        env: { ...process.env, npm_config_cache: path.resolve('.tmp/npm-pack-cache') },
      })
      if (packed.status !== 0) throw new Error(`Package integrity pack failed: ${packed.stderr}`)
      const [{ filename }] = JSON.parse(packed.stdout)
      const extracted = spawnSync('tar', ['-xzf', path.join(temporary, filename), '-C', temporary], {
        encoding: 'utf8',
      })
      if (extracted.status !== 0) throw new Error(`Package integrity extraction failed: ${extracted.stderr}`)
      assertMigrationParity(path.join(temporary, 'package/templates/base'))
      console.log(
        `Packed scaffold: ${expectedMigrations.length} migration names and SQL hashes match canonical source.`,
      )
    } finally {
      rmSync(temporary, { recursive: true, force: true })
    }
  }
}
