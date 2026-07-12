import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import { TestRunArtifactAccessService } from './test-run-artifact-access-service'

export type TestRunArtifactContext = { appraiseRoot: string }

export function createTestRunArtifactContext(
  appraiseRoot = path.join(process.cwd(), '.appraise'),
): TestRunArtifactContext {
  return { appraiseRoot: path.resolve(appraiseRoot) }
}

export function createTestRunArtifactAccess(context: TestRunArtifactContext, client: PrismaClient = prisma) {
  return new TestRunArtifactAccessService(client, context.appraiseRoot)
}
