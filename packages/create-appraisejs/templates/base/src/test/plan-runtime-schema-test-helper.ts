import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

async function applyMigration(databasePath: string, name: string) {
  execFileSync('sqlite3', [databasePath], {
    input: await fs.readFile(path.join(process.cwd(), 'prisma', 'migrations', name, 'migration.sql')),
  })
}

function hasTable(databasePath: string, tableName: string): boolean {
  return Boolean(
    execFileSync('sqlite3', [
      databasePath,
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}';`,
    ])
      .toString()
      .trim(),
  )
}

function hasColumn(databasePath: string, tableName: string, columnName: string): boolean {
  return Boolean(
    execFileSync('sqlite3', [
      databasePath,
      `SELECT name FROM pragma_table_info('${tableName}') WHERE name='${columnName}';`,
    ])
      .toString()
      .trim(),
  )
}

function addPublishOperationToPlanEvents(databasePath: string) {
  execFileSync('sqlite3', [databasePath], {
    input: `ALTER TABLE "PlanEvent" ADD COLUMN "publishOperationId" TEXT REFERENCES "ValidationAstPublishOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "PlanEvent_publishOperationId_type_key" ON "PlanEvent"("publishOperationId", "type");`,
  })
}

export async function ensurePlanProjectionTestSchema(databasePath: string) {
  if (!hasTable(databasePath, 'PlanProjection')) {
    await applyMigration(databasePath, '20260609002500_add_plan_projection_and_sync')
  }

  if (!hasColumn(databasePath, 'PlanProjection', 'description')) {
    await applyMigration(databasePath, '20260613015000_add_plan_description')
  }

  if (!hasColumn(databasePath, 'PlanProjection', 'targetProjectId')) {
    await applyMigration(databasePath, '20260628090000_add_target_projects')
  }

  if (!hasColumn(databasePath, 'PlanProjection', 'slug')) {
    await applyMigration(databasePath, '20260628103000_add_plan_slug_legacy_identity')
  }

  if (
    hasTable(databasePath, 'ValidationAstPublishOperation') &&
    hasTable(databasePath, 'PlanEvent') &&
    !hasColumn(databasePath, 'PlanEvent', 'publishOperationId')
  ) {
    addPublishOperationToPlanEvents(databasePath)
  }
}

export async function ensureCoordinatorPlanRuntimeTestSchema(databasePath: string) {
  await ensurePlanProjectionTestSchema(databasePath)

  if (!hasTable(databasePath, 'PlanEvent')) {
    await applyMigration(databasePath, '20260609090000_add_plan_review_runtime')
  }

  if (!hasTable(databasePath, 'AppraiseProjectIdentity')) {
    await applyMigration(databasePath, '20260609160000_add_coordinator_events_api_mcp')
  }

  if (!hasTable(databasePath, 'StepBlock')) {
    await applyMigration(databasePath, '20260709090000_add_step_blocks')
  }

  if (!hasTable(databasePath, 'BaselineAttempt')) {
    await applyMigration(databasePath, '20260711120000_add_baseline_attempt_history')
  }

  if (!hasTable(databasePath, 'DelegatedAuthorizationNonce')) {
    await applyMigration(databasePath, '20260711150000_add_delegated_authorization_nonces')
  }
  if (!hasTable(databasePath, 'DelegatedValidationAstSubmission')) {
    await applyMigration(databasePath, '20260711170000_add_delegated_ast_submissions')
  }
  if (!hasTable(databasePath, 'ValidationAstPublishOperation')) {
    await applyMigration(databasePath, '20260711190000_add_validation_ast_publish_journal')
  } else if (!hasColumn(databasePath, 'PlanEvent', 'publishOperationId')) {
    addPublishOperationToPlanEvents(databasePath)
  }
}

export async function ensureProviderRunTestSchema(databasePath: string) {
  await ensureCoordinatorPlanRuntimeTestSchema(databasePath)

  if (!hasTable(databasePath, 'ProviderWorkflowRun')) {
    await applyMigration(databasePath, '20260701090000_add_provider_workflow_runs')
  }

  if (!hasColumn(databasePath, 'ProviderAdapterRegistration', 'launchEnabled')) {
    await applyMigration(databasePath, '20260701120000_add_provider_registration_settings')
  }
}
