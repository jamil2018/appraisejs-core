#!/usr/bin/env tsx

import fs from 'fs'
import path from 'path'

const envContent = `# Database configuration for local development
DATABASE_URL="file:./dev.db"
`

/**
 * Ensures local `.env` exists with a default SQLite DATABASE_URL.
 */
function main(): void {
  const envPath = path.join(process.cwd(), '.env')

  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, envContent)
    console.log('Created .env file with SQLite configuration')
  } else {
    console.log('.env file already exists, skipping creation')
  }

  console.log('Environment setup complete!')
}

main()
