#!/usr/bin/env tsx

import fs from 'fs'
import path from 'path'

const envContent = `# Database configuration for local development
DATABASE_URL="file:./prisma/dev.db"
`

const envPath = path.join(process.cwd(), '.env')

if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, envContent)
  console.log('✅ Created .env file with SQLite configuration')
} else {
  console.log('ℹ️  .env file already exists, skipping creation')
}

console.log('🎉 Environment setup complete!')
