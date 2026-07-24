#!/usr/bin/env tsx

import prisma from '../src/config/db-config'
import { StepBlockMigrationService } from '../src/services/step-definition/step-block-migration-service'

const applyDrafts = process.argv.includes('--apply-drafts')
const service = new StepBlockMigrationService(prisma)

try {
  const rows = applyDrafts ? await service.applyDrafts() : await service.preview()
  console.log(JSON.stringify({ mode: applyDrafts ? 'apply-drafts' : 'dry-run', rows }, null, 2))
} finally {
  await prisma.$disconnect()
}
