import { spawnSync } from 'node:child_process'
import path from 'node:path'

const packages = ['packages/appraisejs', 'packages/create-appraisejs']
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
}
