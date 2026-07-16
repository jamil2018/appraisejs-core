import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { spawnSync } from 'node:child_process'

const ROWS = 20_000
const ITERATIONS = 250
const root = mkdtempSync(path.join(os.tmpdir(), 'appraise-query-benchmark-'))
const database = path.join(root, 'fixture.db')
const runSql = sql => {
  const result = spawnSync('/usr/bin/sqlite3', [database], { input: sql, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || 'sqlite3 benchmark failed')
  return result.stdout.trim().split('\n').filter(Boolean)
}
const query = `SELECT id, startedAt FROM TestRun
WHERE targetProjectId = 'project-7'
  AND (startedAt < '1970-06-23T14:40:00.000Z' OR (startedAt = '1970-06-23T14:40:00.000Z' AND id < 'run-015000'))
ORDER BY startedAt DESC, id DESC LIMIT 51;`
const plan = () => runSql(`EXPLAIN QUERY PLAN ${query}`).map(line => line.split('|').at(-1))
const measure = () => {
  const started = performance.now()
  runSql(Array.from({ length: ITERATIONS }, () => query).join('\n'))
  return Number((performance.now() - started).toFixed(2))
}

try {
  runSql(`CREATE TABLE TestRun (id TEXT PRIMARY KEY, targetProjectId TEXT, startedAt TEXT, status TEXT);
WITH RECURSIVE sequence(value) AS (SELECT 0 UNION ALL SELECT value + 1 FROM sequence WHERE value < ${ROWS - 1})
INSERT INTO TestRun SELECT printf('run-%06d', value), printf('project-%d', value % 20),
  strftime('%Y-%m-%dT%H:%M:%fZ', value, 'unixepoch'), 'COMPLETED' FROM sequence;`)
  const before = { plan: plan(), durationMs: measure() }
  runSql('CREATE INDEX TestRun_targetProjectId_startedAt_id_idx ON TestRun(targetProjectId, startedAt, id);')
  const after = { plan: plan(), durationMs: measure() }
  process.stdout.write(`${JSON.stringify({ rows: ROWS, iterations: ITERATIONS, before, after }, null, 2)}\n`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
