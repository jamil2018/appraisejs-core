import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'

const workspaces: string[] = []
const hash = (letter: string) => `sha256:${letter.repeat(64)}`

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

describe('remote scope audit rows are insert-only', () => {
  it('rejects both UPDATE and DELETE for bindings and issuances without changing either row', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-remote-scope-audit-'))
    workspaces.push(workspace)
    const databasePath = path.join(workspace, 'appraise.db')
    await copyMigratedTestDatabase(databasePath)
    const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
    try {
      await client.targetProject.create({
        data: {
          id: 'target-audit',
          kind: 'REMOTE_BLACK_BOX',
          canonicalIdentity: 'url:https://audit.example',
          normalizedRemoteOrigin: 'https://audit.example',
          displayName: 'Audit fixture',
          fingerprint: hash('a'),
        },
      })
      await client.evaluationSubjectRevision.create({
        data: {
          id: 'subject-audit',
          subjectDigest: hash('b'),
          subjectKind: 'REMOTE_EVALUATION_SCOPE',
          authority: 'appraisejs:remote-evaluation-scope:v2',
          metadataJson:
            '{"schemaVersion":"appraise.remote-evaluation-scope/v2","scopeHash":"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","targetContentIdentity":"not_asserted","identityStrength":"evaluation_scope_only"}',
        },
      })
      await client.remoteEvaluationScopeBinding.create({
        data: {
          id: 'binding-audit',
          evaluationSubjectRevisionId: 'subject-audit',
          targetProjectId: 'target-audit',
          qualityPlanId: 'plan-audit',
          qualityPlanRevisionId: 'revision-audit',
          environmentId: 'environment-audit',
          scopeHash: hash('c'),
          scopeSchemaVersion: 'appraise.remote-evaluation-scope/v2',
          preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v2',
          scopeIntentHash: hash('c'),
          realizationIntentHash: hash('d'),
          preflightHash: hash('e'),
          canonicalPreflightJson: '{}',
          targetFingerprint: hash('a'),
          designHash: hash('f'),
          revisionContentHash: hash('a'),
          validationBindingsHash: hash('b'),
          realizationPreflightHash: hash('e'),
          runtimePolicyHash: hash('c'),
          securityPolicyHash: hash('d'),
          evidencePolicyHash: hash('e'),
          canonicalScopeJson: '{}',
          validationBindingsJson: '[]',
          environmentSnapshotHash: hash('f'),
          environmentSnapshotJson: '{}',
          environmentScopeVersion: 1,
          environmentUpdatedAt: new Date('2026-08-24T00:00:00.000Z'),
        },
      })
      await client.remoteEvaluationScopeIssuance.create({
        data: {
          id: 'issuance-audit',
          targetProjectId: 'target-audit',
          idempotencyKey: 'audit-key',
          requestHash: hash('f'),
          evaluationSubjectRevisionId: 'subject-audit',
        },
      })
      const before = {
        binding: await client.remoteEvaluationScopeBinding.findUniqueOrThrow({ where: { id: 'binding-audit' } }),
        issuance: await client.remoteEvaluationScopeIssuance.findUniqueOrThrow({ where: { id: 'issuance-audit' } }),
      }
      await expect(
        client.$executeRawUnsafe(
          'UPDATE "RemoteEvaluationScopeBinding" SET "scopeHash" = ? WHERE "id" = ?',
          hash('f'),
          'binding-audit',
        ),
      ).rejects.toThrow(/insert-only/)
      await expect(
        client.$executeRawUnsafe('DELETE FROM "RemoteEvaluationScopeBinding" WHERE "id" = ?', 'binding-audit'),
      ).rejects.toThrow(/insert-only/)
      await expect(
        client.$executeRawUnsafe(
          'UPDATE "RemoteEvaluationScopeIssuance" SET "requestHash" = ? WHERE "id" = ?',
          hash('e'),
          'issuance-audit',
        ),
      ).rejects.toThrow(/insert-only/)
      await expect(
        client.$executeRawUnsafe('DELETE FROM "RemoteEvaluationScopeIssuance" WHERE "id" = ?', 'issuance-audit'),
      ).rejects.toThrow(/insert-only/)
      expect(await client.remoteEvaluationScopeBinding.findUniqueOrThrow({ where: { id: 'binding-audit' } })).toEqual(
        before.binding,
      )
      expect(await client.remoteEvaluationScopeIssuance.findUniqueOrThrow({ where: { id: 'issuance-audit' } })).toEqual(
        before.issuance,
      )
    } finally {
      await client.$disconnect()
    }
  }, 60_000)
})
