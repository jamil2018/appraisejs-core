type Row = Record<string, unknown>
export type JourneyAuditDatabase = { prepare(sql: string): { all(...parameters: unknown[]): Row[] } }
type Issue = { table: string; recordId: string; reason: string }

const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`

/** Read-only audit of physical references plus Journey ownership, which SQLite
 * single-column foreign keys alone cannot establish. No payloads leave the audit. */
export function auditQualityJourneyIntegrity(database: JourneyAuditDatabase) {
  const issues: Issue[] = []
  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map(row => String(row.name))
  if (!tables.includes('QualityJourney'))
    throw new Error('Quality Journey schema is missing; apply forward migrations.')
  for (const row of database.prepare('PRAGMA foreign_key_check').all())
    issues.push({ table: String(row.table), recordId: String(row.rowid), reason: 'FOREIGN_KEY_ORPHAN' })
  let checkedTables = 0
  for (const table of tables.filter(name => name.startsWith('QualityJourney'))) {
    checkedTables++
    const columns = database
      .prepare(`PRAGMA table_info(${identifier(table)})`)
      .all()
      .map(row => row.name)
    if (!columns.includes('journeyId')) continue
    const owner = columns.includes('targetProjectId') ? ' OR r.targetProjectId != j.targetProjectId' : ''
    for (const row of database
      .prepare(
        `SELECT r.id FROM ${identifier(table)} r LEFT JOIN QualityJourney j ON j.id=r.journeyId WHERE j.id IS NULL${owner}`,
      )
      .all())
      issues.push({ table, recordId: String(row.id), reason: 'JOURNEY_SCOPE_MISMATCH' })
    if (columns.includes('cycleId')) {
      for (const row of database
        .prepare(
          `SELECT r.id FROM ${identifier(table)} r LEFT JOIN QualityJourneyCycle c ON c.id=r.cycleId AND c.journeyId=r.journeyId WHERE c.id IS NULL`,
        )
        .all())
        issues.push({ table, recordId: String(row.id), reason: 'CYCLE_SCOPE_MISMATCH' })
    }
  }
  checkJourneyHeads(database, issues)
  checkRelationalOwnership(database, tables, issues)
  checkOwnershipEdges(database, issues)
  return {
    schema: 'appraise.quality-journey-integrity/v1',
    result: issues.length ? 'FAIL' : 'PASS',
    checkedTables,
    compatibilityLineage: 'NOT_ASSERTED_NO_PERSISTED_JOURNEY_MAPPING',
    issues,
  }
}

/** Follow declared relationships using identifiers only. In particular, rows
 * without journeyId (scenario decisions and attempts) inherit ownership through
 * their parents; two individually valid foreign keys can still cross journeys. */
function checkRelationalOwnership(database: JourneyAuditDatabase, tables: string[], issues: Issue[]) {
  type Relation = { table: string; fields: Array<{ from: string; to: string }> }
  const schemas = new Map<string, { columns: string[]; primaryKey: string[]; relations: Relation[] }>()
  for (const table of tables) {
    const metadata = database.prepare(`PRAGMA table_info(${identifier(table)})`).all()
    const columns = metadata.map(row => String(row.name))
    const primaryKey = metadata
      .filter(row => Number(row.pk) > 0)
      .sort((left, right) => Number(left.pk) - Number(right.pk))
      .map(row => String(row.name))
    const grouped = new Map<string, Relation>()
    for (const fk of database.prepare(`PRAGMA foreign_key_list(${identifier(table)})`).all()) {
      const key = String(fk.id)
      const relation = grouped.get(key) ?? { table: String(fk.table), fields: [] }
      relation.fields.push({ from: String(fk.from), to: String(fk.to) })
      grouped.set(key, relation)
    }
    schemas.set(table, { columns, primaryKey, relations: [...grouped.values()] })
  }
  const columnsFor = (table: string) => {
    const schema = schemas.get(table)!
    return [
      ...new Set([
        ...schema.primaryKey,
        'id',
        'journeyId',
        'targetProjectId',
        ...schema.relations.flatMap(relation => relation.fields.map(field => field.from)),
      ]),
    ].filter(column => schema.columns.includes(column))
  }
  const recordIdentity = (table: string, row: Row) => {
    const values = schemas.get(table)!.primaryKey.map(column => row[column])
    return values.length === 1 ? String(values[0]) : JSON.stringify(values)
  }
  const parents = (table: string, row: Row) =>
    schemas.get(table)!.relations.flatMap(relation => {
      if (relation.fields.some(field => row[field.from] == null)) return []
      const fields = columnsFor(relation.table)
      if (!fields.length) return []
      const records = database
        .prepare(
          `SELECT ${fields.map(identifier).join(',')} FROM ${identifier(relation.table)} WHERE ${relation.fields.map(field => `${identifier(field.to)}=?`).join(' AND ')}`,
        )
        .all(...relation.fields.map(field => row[field.from]))
      return records.map(record => ({ table: relation.table, row: record }))
    })
  const owner = (table: string, row: Row, seen = new Set<string>()): { journeys: string[]; targets: string[] } => {
    const journeys =
      table === 'QualityJourney' ? [String(row.id)] : typeof row.journeyId === 'string' ? [row.journeyId] : []
    const targets =
      table === 'TargetProject'
        ? [String(row.id)]
        : typeof row.targetProjectId === 'string'
          ? [row.targetProjectId]
          : []
    const key = `${table}:${recordIdentity(table, row)}`
    if (seen.has(key) || !table.startsWith('QualityJourney') || journeys.length) return { journeys, targets }
    const next = new Set(seen).add(key)
    for (const parent of parents(table, row)) {
      const inherited = owner(parent.table, parent.row, next)
      journeys.push(...inherited.journeys)
      targets.push(...inherited.targets)
    }
    return { journeys, targets }
  }
  for (const table of tables.filter(name => name.startsWith('QualityJourney'))) {
    for (const row of database
      .prepare(`SELECT ${columnsFor(table).map(identifier).join(',')} FROM ${identifier(table)}`)
      .all()) {
      const ownership = owner(table, row)
      for (const parent of parents(table, row)) {
        const inherited = owner(parent.table, parent.row)
        ownership.journeys.push(...inherited.journeys)
        ownership.targets.push(...inherited.targets)
      }
      if (new Set(ownership.journeys).size > 1 || new Set(ownership.targets).size > 1)
        issues.push({ table, recordId: recordIdentity(table, row), reason: 'RELATION_OWNERSHIP_MISMATCH' })
    }
  }
}

function checkJourneyHeads(database: JourneyAuditDatabase, issues: Issue[]) {
  for (const journey of database
    .prepare(
      'SELECT id, activeCycleId, activeRevisionIdsJson, activeWorkItemIdsJson, blockerIdsJson FROM QualityJourney',
    )
    .all()) {
    const id = String(journey.id)
    const issue = (reason: string) => issues.push({ table: 'QualityJourney', recordId: id, reason })
    if (
      !database
        .prepare('SELECT id FROM QualityJourneyCycle WHERE id=? AND journeyId=?')
        .all(String(journey.activeCycleId), id).length
    )
      issue('ACTIVE_CYCLE_ORPHAN')
    try {
      const revisions: unknown = JSON.parse(String(journey.activeRevisionIdsJson))
      if (!revisions || typeof revisions !== 'object' || Array.isArray(revisions)) throw new Error('Invalid revisions')
      for (const [kind, revision] of Object.entries(revisions)) {
        if (typeof revision !== 'string') throw new Error('Invalid revision')
        const rows =
          kind === 'journey'
            ? database.prepare('SELECT id FROM QualityJourneyRevision WHERE id=? AND journeyId=?').all(revision, id)
            : database
                .prepare('SELECT id FROM QualityJourneyArtifact WHERE (revisionId=? OR artifactId=?) AND journeyId=?')
                .all(revision, revision, id)
        if (!rows.length) issue('ACTIVE_REVISION_ORPHAN')
      }
      for (const [field, table] of [
        ['activeWorkItemIdsJson', 'QualityJourneyWorkItem'],
        ['blockerIdsJson', 'QualityJourneyBlocker'],
      ]) {
        const ids: unknown = JSON.parse(String(journey[field!]))
        if (!Array.isArray(ids) || ids.some(value => typeof value !== 'string')) throw new Error('Invalid head list')
        for (const reference of ids)
          if (
            !database.prepare(`SELECT id FROM ${identifier(table!)} WHERE id=? AND journeyId=?`).all(reference, id)
              .length
          )
            issue('ACTIVE_REFERENCE_ORPHAN')
      }
    } catch {
      issue('INVALID_HEAD_JSON')
    }
  }
}

function checkOwnershipEdges(database: JourneyAuditDatabase, issues: Issue[]) {
  const checks = [
    [
      'QualityJourneyCycle',
      'SELECT c.id FROM QualityJourneyCycle c JOIN QualityJourneyCycle p ON p.id=c.predecessorCycleId WHERE p.journeyId != c.journeyId',
      'CROSS_JOURNEY_PREDECESSOR',
    ],
    [
      'QualityJourneyCycle',
      'SELECT c.id FROM QualityJourneyCycle c LEFT JOIN QualityJourneyCycle p ON p.id=c.predecessorCycleId WHERE c.predecessorCycleId IS NOT NULL AND p.id IS NULL',
      'PREDECESSOR_ORPHAN',
    ],
    [
      'QualityJourneyWorkAttempt',
      'SELECT a.id FROM QualityJourneyWorkAttempt a JOIN QualityJourneyWorkAttempt p ON p.id=a.replacesAttemptId WHERE a.workItemId != p.workItemId',
      'CROSS_WORK_ITEM_REPLACEMENT',
    ],
    [
      'QualityJourneyWorkAuthorization',
      'SELECT a.id FROM QualityJourneyWorkAuthorization a JOIN QualityJourneyWorkItem w ON w.id=a.workItemId WHERE a.journeyId != w.journeyId OR a.targetProjectId != w.targetProjectId OR a.role != w.role',
      'WORK_AUTHORITY_MISMATCH',
    ],
    [
      'QualityJourneyExecutionTestRun',
      'SELECT b.id FROM QualityJourneyExecutionTestRun b JOIN QualityJourneyExecutionCycle c ON c.id=b.executionCycleId JOIN TestRun r ON r.id=b.testRunId JOIN QualityJourneyPreparedRuntimeCapsule p ON p.id=b.preparedCapsuleId WHERE r.targetProjectId != c.targetProjectId OR p.journeyId != c.journeyId OR p.targetProjectId != c.targetProjectId',
      'EXECUTION_SCOPE_MISMATCH',
    ],
  ]
  for (const [table, sql, reason] of checks)
    for (const row of database.prepare(sql!).all())
      issues.push({ table: table!, recordId: String(row.id), reason: reason! })
}
