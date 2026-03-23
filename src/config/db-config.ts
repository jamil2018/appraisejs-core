import fs from 'fs'
import { createRequire } from 'module'
import path from 'path'

function readProjectDatabaseUrl(): string | null {
  const envPath = path.join(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) {
    return null
  }

  const envContent = fs.readFileSync(envPath, 'utf8')
  const match = envContent.match(/^\s*DATABASE_URL\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\r\n]+))\s*$/m)
  const rawValue = match?.[1] ?? match?.[2] ?? match?.[3]
  const normalizedValue = rawValue?.trim()

  return normalizedValue ? normalizedValue : null
}

function normalizeDatabaseUrl(databaseUrl: string): string {
  if (!databaseUrl.startsWith('file:')) {
    return databaseUrl
  }

  const sqlitePathWithQuery = databaseUrl.slice('file:'.length)
  if (!sqlitePathWithQuery || sqlitePathWithQuery === ':memory:') {
    return databaseUrl
  }

  const queryStartIndex = sqlitePathWithQuery.indexOf('?')
  const sqlitePath = queryStartIndex >= 0 ? sqlitePathWithQuery.slice(0, queryStartIndex) : sqlitePathWithQuery
  const query = queryStartIndex >= 0 ? sqlitePathWithQuery.slice(queryStartIndex) : ''

  if (path.isAbsolute(sqlitePath)) {
    return databaseUrl
  }

  // Prisma resolves relative SQLite paths from the schema directory. The app's schema
  // lives in `<project>/prisma`, so normalize local file URLs to that location.
  const absolutePath = path.resolve(process.cwd(), 'prisma', sqlitePath)
  return `file:${absolutePath}${query}`
}

function ensureProjectDatabaseUrl(): void {
  if (process.env.DATABASE_URL) {
    return
  }

  const projectDatabaseUrl = readProjectDatabaseUrl()
  if (!projectDatabaseUrl) {
    return
  }

  process.env.DATABASE_URL = normalizeDatabaseUrl(projectDatabaseUrl)
}

ensureProjectDatabaseUrl()

type PrismaClientInstance = import('@prisma/client').PrismaClient
const require = createRequire(import.meta.url)
const { PrismaClient } = require('@prisma/client') as {
  PrismaClient: new () => PrismaClientInstance
}

const globalForPrisma = global as unknown as {
  prisma: PrismaClientInstance | undefined
}
const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
