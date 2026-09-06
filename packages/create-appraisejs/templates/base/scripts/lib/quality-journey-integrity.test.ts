import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { auditQualityJourneyIntegrity, type JourneyAuditDatabase } from './quality-journey-integrity'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => JourneyAuditDatabase & { exec(sql: string): void; close(): void }
}
let database: InstanceType<typeof DatabaseSync>
beforeEach(() => {
  database = new DatabaseSync(':memory:')
  const root = join(process.cwd(), 'prisma/migrations')
  for (const entry of readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name)))
    database.exec(readFileSync(join(root, entry.name, 'migration.sql'), 'utf8'))
  database.exec(`
    INSERT INTO TargetProject (id,kind,canonicalIdentity,canonicalPath,displayName,fingerprint,updatedAt)
    VALUES ('target','LOCAL_WORKSPACE','path:/tmp/journey-audit','/tmp/journey-audit','Audit','sha256:target',CURRENT_TIMESTAMP);
    INSERT INTO QualityJourney (id,targetProjectId,rootIdempotencyKey,rootRequestHash,activeCycleId,activeRevisionIdsJson,stateHash,updatedAt)
    VALUES ('journey','target','root','sha256:root','cycle','{"journey":"revision"}','sha256:state',CURRENT_TIMESTAMP);
    INSERT INTO QualityJourneyRevision (id,journeyId,revision,contentJson,contentHash)
    VALUES ('revision','journey',1,'{}','sha256:requirement');
    INSERT INTO QualityJourneyCycle (id,journeyId,sequence) VALUES ('cycle','journey',1);
    INSERT INTO QualityJourneyArtifact (id,identityKey,journeyId,targetProjectId,cycleId,kind,artifactId,revisionId,contentHash,artifactJson)
    VALUES ('artifact','artifact-key','journey','target','cycle','ANALYSIS_CHARTER_REVISION','analysis','analysis-1','sha256:analysis','{}');
  `)
})
afterEach(() => database.close())

it('passes forward migrations and populated generated references without changing records', () => {
  const before = database.prepare('SELECT * FROM QualityJourney').all()
  expect(auditQualityJourneyIntegrity(database)).toMatchObject({ result: 'PASS', issues: [] })
  expect(database.prepare('SELECT * FROM QualityJourney').all()).toEqual(before)
})

it('detects cross-target artifacts and cycle references that single-column foreign keys allow', () => {
  database.exec(`INSERT INTO QualityJourneyArtifact (id,identityKey,journeyId,targetProjectId,cycleId,kind,artifactId,contentHash,artifactJson)
    VALUES ('corrupt','corrupt-key','journey','foreign','absent','ANALYSIS_CHARTER_REVISION','foreign-analysis','sha256:corrupt','{}')`)
  expect(auditQualityJourneyIntegrity(database).issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ recordId: 'corrupt', reason: 'JOURNEY_SCOPE_MISMATCH' }),
      expect.objectContaining({ recordId: 'corrupt', reason: 'CYCLE_SCOPE_MISMATCH' }),
    ]),
  )
})

it('detects missing active revisions and malformed head references without returning payloads', () => {
  database.exec(
    `UPDATE QualityJourney SET activeRevisionIdsJson='{"analysis":"absent"}', activeWorkItemIdsJson='{"secret":"never-return"}'`,
  )
  const result = auditQualityJourneyIntegrity(database)
  expect(result.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ reason: 'ACTIVE_REVISION_ORPHAN' }),
      expect.objectContaining({ reason: 'INVALID_HEAD_JSON' }),
    ]),
  )
  expect(JSON.stringify(result)).not.toContain('never-return')
})

it('detects physical orphans and dangling predecessor cycles in imported history', () => {
  database.exec(
    `PRAGMA foreign_keys=OFF;
     INSERT INTO QualityJourneyArtifact (id,identityKey,journeyId,targetProjectId,cycleId,kind,artifactId,contentHash,artifactJson)
     VALUES ('orphan','orphan-key','absent','target','cycle','ANALYSIS_CHARTER_REVISION','orphan-analysis','sha256:orphan','{}');
     INSERT INTO QualityJourneyCycle (id,journeyId,sequence,predecessorCycleId) VALUES ('cycle-2','journey',2,'absent');`,
  )
  expect(auditQualityJourneyIntegrity(database).issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ reason: 'FOREIGN_KEY_ORPHAN' }),
      expect.objectContaining({ reason: 'PREDECESSOR_ORPHAN' }),
    ]),
  )
})

it('rejects cross-journey relational lineage even when every physical foreign key is valid', () => {
  database.exec(`
    INSERT INTO QualityJourney (id,targetProjectId,rootIdempotencyKey,rootRequestHash,activeCycleId,stateHash,updatedAt)
    VALUES ('other','target','other-root','sha256:other','other-cycle','sha256:other',CURRENT_TIMESTAMP);
    INSERT INTO QualityJourneyCycle (id,journeyId,sequence) VALUES ('other-cycle','other',1);
    INSERT INTO QualityJourneyWorkItem (id,journeyId,targetProjectId,cycleId,role,inputHash,roleContractDigest,updatedAt)
    VALUES ('work','journey','target','cycle','REQUIREMENT_ANALYZER','sha256:input','sha256:role',CURRENT_TIMESTAMP);
    INSERT INTO QualityJourneyWorkAttempt (id,workItemId,attempt,leaseId,ownerTokenHash,leaseExpiresAt,heartbeatSeconds)
    VALUES ('attempt','work',1,'lease','sha256:owner','2030-01-01',30);
    INSERT INTO QualityJourneyAnalysisRevision (id,journeyId,targetProjectId,cycleId,artifactRecordId,artifactId,artifactRevisionId,revision,contentHash,submissionIdempotencyKey,submissionHash,submittedWorkItemId,submittedAttemptId,inputHash)
    VALUES ('analysis-record','journey','target','cycle','artifact','analysis','analysis-1',1,'sha256:analysis','submit','sha256:submit','work','attempt','sha256:input');
    INSERT INTO QualityJourneyArtifact (id,identityKey,journeyId,targetProjectId,cycleId,kind,artifactId,contentHash,artifactJson)
    VALUES ('question-artifact','question-key','other','target','other-cycle','ANALYSIS_QUESTION','question','sha256:question','{}');
  `)
  expect(auditQualityJourneyIntegrity(database).result).toBe('PASS')
  database.exec(`INSERT INTO QualityJourneyAnalysisQuestion (id,journeyId,analysisRevisionId,artifactRecordId,questionId,contentHash,required)
    VALUES ('cross-question','other','analysis-record','question-artifact','question','sha256:question',1)`)
  expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  expect(auditQualityJourneyIntegrity(database).issues).toContainEqual({
    table: 'QualityJourneyAnalysisQuestion',
    recordId: 'cross-question',
    reason: 'RELATION_OWNERSHIP_MISMATCH',
  })
})

it('reports the real primary key for relation-bearing rows without an id column', () => {
  database.exec(`
    INSERT INTO TargetProject (id,kind,canonicalIdentity,canonicalPath,displayName,fingerprint,updatedAt)
    VALUES ('foreign','LOCAL_WORKSPACE','path:/tmp/foreign','/tmp/foreign','Foreign','sha256:foreign',CURRENT_TIMESTAMP);
    CREATE TABLE QualityJourneyOwnershipProbe (
      materializationId TEXT PRIMARY KEY REFERENCES QualityJourneyArtifact(id),
      targetProjectId TEXT REFERENCES TargetProject(id)
    );
    INSERT INTO QualityJourneyOwnershipProbe VALUES ('artifact','foreign');
  `)
  expect(auditQualityJourneyIntegrity(database).issues).toContainEqual({
    table: 'QualityJourneyOwnershipProbe',
    recordId: 'artifact',
    reason: 'RELATION_OWNERSHIP_MISMATCH',
  })
})
