import { rmSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const port = process.argv[2] ?? '3200'
const databaseUrl = process.env.DATABASE_URL ?? 'file:./e2e.db'

function sqlitePathFromDatabaseUrl(value) {
  if (!value.startsWith('file:')) {
    return null
  }

  const sqlitePath = value.replace(/^file:/, '')
  return isAbsolute(sqlitePath) ? sqlitePath : resolve(process.cwd(), 'prisma', sqlitePath)
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const sqlitePath = sqlitePathFromDatabaseUrl(databaseUrl)
if (sqlitePath) {
  rmSync(sqlitePath, { force: true })
  rmSync(`${sqlitePath}-journal`, { force: true })
}

run(process.execPath, ['e2e/apply-migrations.mjs'])

const server = spawn('npx', ['next', 'start', '-p', port], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
    ENVIRONMENT: 'local',
    NEXT_TELEMETRY_DISABLED: '1',
  },
})

server.on('exit', code => {
  process.exit(code ?? 0)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.kill(signal)
  })
}
