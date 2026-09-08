import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import YAML from 'yaml'
import {
  consolidateObservations,
  createLearningObservation,
  createProposal,
  evidenceSnapshot,
  learningPaths,
  lessonFromObservation,
  markStaleLessons,
  readLessons,
  recordSnapshot,
  revalidateLesson,
  retrieveLessons,
  transitionProposal,
  validateLearningReferenceIntegrity,
  validateProposal,
  validateLesson,
  validateLearningObservation,
  writeLesson,
  writeProposal,
} from '../lib/harness-learning.mjs'
import { validateLearningObservation as validateJournalLearningObservation } from '../lib/swarm-ledger-store.mjs'

const scriptsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const learningScript = path.join(scriptsDir, 'harness-learning.mjs')
const recordRunScript = path.join(scriptsDir, 'record-swarm-run.mjs')
const routeScript = path.join(scriptsDir, 'record-swarm-route.mjs')
const evolveScript = path.join(scriptsDir, 'update-swarm-evolution.mjs')
const temporaryDirectory = () => fs.mkdtempSync(path.join(os.tmpdir(), 'appraise-learning-'))

function run(cwd, args) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

function fail(cwd, args, pattern) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, pattern)
}

function observationArgs(overrides = {}) {
  const values = {
    'task-class': 'localized-fix',
    kind: 'failure',
    topic: 'Lock recovery',
    summary: 'A stale lock blocked a run.',
    evidence: 'The focused fixture reproduced the stale lock.',
    polarity: 'supports',
    path: ['scripts/lib'],
    'source-type': 'fixture',
    'source-ref': 'fixture:lock-recovery',
    measurement: ['duration-ms=20'],
    ...overrides,
  }
  return [
    learningScript,
    'record-observation',
    ...Object.entries(values).flatMap(([name, value]) =>
      Array.isArray(value) ? value.flatMap(item => [`--${name}`, item]) : [`--${name}`, value],
    ),
  ]
}

function route(cwd, taskClass = 'localized-fix') {
  return run(cwd, [
    routeScript,
    '--task-class',
    taskClass,
    '--route-input',
    JSON.stringify({ consequence: 'low', verificationStrength: 'strong' }),
    '--rationale',
    'Fixture routing receipt.',
    '--classification-latency-ms',
    '1',
  ]).decision
}

function recordRun(cwd, overrides = {}) {
  const decision = route(cwd, overrides['task-class'] ?? 'localized-fix')
  const values = {
    'task-class': 'localized-fix',
    accuracy: '2',
    coverage: '2',
    routing: '2',
    efficiency: '2',
    coordination: '2',
    'solver-context': 'not-used',
    'solver-context-evidence': 'not-used',
    'judge-context': 'none',
    'judge-context-evidence': 'host-effective-context:fork_turns:none',
    evidence: 'fixture evidence',
    optimization: 'improve fixture',
    'routing-decision-id': decision.decisionId,
    ...overrides,
  }
  return run(cwd, [
    recordRunScript,
    ...Object.entries(values).flatMap(([name, value]) =>
      Array.isArray(value) ? value.flatMap(item => [`--${name}`, item]) : [`--${name}`, value],
    ),
  ]).run
}

test('capture is idempotent, validates sanitization, and stores local observations in the journal', () => {
  const cwd = temporaryDirectory()
  const first = run(cwd, observationArgs())
  const second = run(cwd, observationArgs())
  assert.equal(first.recorded, true)
  assert.equal(second.recorded, false)
  const journal = fs
    .readFileSync(path.join(cwd, '.appraisejs', 'swarm-events.jsonl'), 'utf8')
    .trim()
    .split('\n')
  assert.equal(journal.length, 1)
  assert.equal(JSON.parse(journal[0]).kind, 'learning.observation')
  fail(cwd, observationArgs({ evidence: 'Bearer private-value' }), /potentially sensitive or machine-specific evidence/)
  fail(cwd, observationArgs({ evidence: 'Observed under /Users/operator/project.' }), /machine-specific evidence/)
})

test('repository learning records fail clearly for malformed names and mismatched identities', () => {
  const malformedCwd = temporaryDirectory()
  fs.mkdirSync(learningPaths(malformedCwd).lessons, { recursive: true })
  fs.writeFileSync(path.join(learningPaths(malformedCwd).lessons, 'lesson-bad.md'), '# malformed\n')
  assert.throws(() => readLessons(malformedCwd), /invalid lesson filename/)

  const mismatchCwd = temporaryDirectory()
  const observation = createLearningObservation({
    taskClass: 'localized-fix',
    kind: 'failure',
    topic: 'Identity check',
    summary: 'The fixture has a stable identity.',
    evidenceSummary: 'The fixture wrote a record.',
    polarity: 'supports',
    paths: ['scripts'],
    sourceType: 'fixture',
    sourceRef: 'fixture:identity',
    measurements: {},
  })
  consolidateObservations(mismatchCwd, [observation], '1.0')
  const original = readLessons(mismatchCwd)[0].metadata.id
  fs.renameSync(
    path.join(learningPaths(mismatchCwd).lessons, `${original}.md`),
    path.join(learningPaths(mismatchCwd).lessons, 'lesson-0123456789abcdef.md'),
  )
  assert.throws(() => readLessons(mismatchCwd), /metadata id does not match filename/)
})

test('legacy pending evolution observations migrate once with retained run provenance', () => {
  const cwd = temporaryDirectory()
  const guidance = 'Ship later after evidence. '.repeat(20).trim()
  const legacy = recordRun(cwd, {
    observation: ['validation|material|missing proof|fixture probe|false pass|add proof'],
  })
  run(cwd, [evolveScript, '--run-id', legacy.runId, '--action', 'notify', '--delivery-receipt', 'fixture-delivery'])
  run(cwd, [
    evolveScript,
    '--run-id',
    legacy.runId,
    '--action',
    'guide',
    '--guidance',
    guidance,
    '--authority-source',
    'host-conversation',
    '--thread-id',
    'fixture-thread',
    '--message-id',
    'fixture-message',
  ])
  const first = run(cwd, [learningScript, 'migrate'])
  const second = run(cwd, [learningScript, 'migrate'])
  assert.equal(first.imported.length, 1)
  assert.equal(second.imported.length, 0)
  assert.equal(second.skipped.length, 1)
  const journal = fs.readFileSync(path.join(cwd, '.appraisejs', 'swarm-events.jsonl'), 'utf8')
  assert.match(journal, new RegExp(`run:${legacy.runId}`))
  const migrated = journal
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
    .find(event => event.kind === 'learning.observation')
  assert.equal(migrated.observation.sourceRef, `run:${legacy.runId}`)
  assert.equal(migrated.observation.guidance, guidance)
  assert.equal(migrated.observation.observedAt, legacy.recordedAt)
  run(cwd, [learningScript, 'consolidate', '--harness-version', '1.0'])
  const importedLesson = readLessons(cwd)[0].metadata
  assert.equal(importedLesson.status, 'stale')
  assert.equal(importedLesson.confidence, 'low')
  assert.equal(importedLesson.lastValidatedAt, legacy.recordedAt)
})

test('proposal creation resolves supporting records into portable evidence and rejects unknown references', () => {
  const cwd = temporaryDirectory()
  const observation = run(cwd, observationArgs()).observation
  const base = [
    learningScript,
    'propose',
    '--title',
    'Avoid repeated setup',
    '--problem',
    'Setup repeats.',
    '--suggested-change',
    'Reuse setup.',
    '--expected-benefit',
    'Fewer commands.',
    '--effort',
    'small',
    '--risk',
    'stale setup',
    '--acceptance-measurement',
    'setup count',
    '--task-class',
    'localized-fix',
    '--path',
    'scripts',
  ]
  fail(cwd, [...base, '--supporting-record', 'obs-0123456789abcdef'], /Unknown supporting record/)
  const created = run(cwd, [...base, '--supporting-record', observation.observationId])
  assert.equal(created.proposal.supportingEvidence[0].id, observation.observationId)
  assert.equal(created.proposal.supportingEvidence[0].evidenceSummary, observation.evidenceSummary)
})

test('consolidation is idempotent, keeps counterexamples, and leaves ambiguous matches unresolved', () => {
  const cwd = temporaryDirectory()
  const first = run(cwd, observationArgs())
  const contradiction = run(
    cwd,
    observationArgs({
      summary: 'A different operating system did not reproduce the lock.',
      evidence: 'The independent fixture disagreed.',
      polarity: 'contradicts',
      'source-ref': 'fixture:lock-recovery-other-host',
    }),
  )
  const consolidated = run(cwd, [learningScript, 'consolidate', '--harness-version', '1.0'])
  assert.equal(consolidated.created.length, 1)
  const repeat = run(cwd, [learningScript, 'consolidate', '--harness-version', '1.0'])
  assert.equal(repeat.skipped.length, 2)
  const lesson = readLessons(cwd)[0].metadata
  assert.ok(lesson.evidenceRefs.includes(first.observation.observationId))
  assert.ok(lesson.counterexampleRefs.includes(contradiction.observation.observationId))
  assert.equal(lesson.confidence, 'low')

  const duplicate = structuredClone(lesson)
  duplicate.id = 'lesson-0123456789abcdef'
  validateLesson(duplicate)
  writeLesson(cwd, duplicate)
  const third = run(
    cwd,
    observationArgs({
      summary: 'A third fixture has more evidence.',
      evidence: 'The third fixture completed.',
      'source-ref': 'fixture:lock-recovery-third',
    }),
  )
  const ambiguous = run(cwd, [learningScript, 'consolidate', '--harness-version', '1.0'])
  assert.deepEqual(ambiguous.ambiguous[0].lessonIds.sort(), [lesson.id, duplicate.id].sort())
  assert.ok(ambiguous.ambiguous.some(item => item.observationId === third.observation.observationId))
  for (const candidate of readLessons(cwd)) {
    assert.ok(candidate.metadata.ambiguousObservationRefs.includes(third.observation.observationId))
    assert.ok(candidate.metadata.evidence.some(item => item.id === third.observation.observationId))
  }
  const afterRepeat = run(cwd, [learningScript, 'consolidate', '--harness-version', '1.0'])
  assert.ok(afterRepeat.ambiguous.some(item => item.observationId === third.observation.observationId))
  for (const candidate of readLessons(cwd)) {
    assert.equal(
      candidate.metadata.ambiguousObservationRefs.filter(item => item === third.observation.observationId).length,
      1,
    )
  }
  const firstRetrieval = retrieveLessons(
    cwd,
    { taskClass: 'localized-fix', paths: ['scripts'], limit: 2 },
    '2026-01-01T00:00:00.000Z',
  )
  const suppressedRetrieval = retrieveLessons(
    cwd,
    { taskClass: 'localized-fix', paths: ['scripts'], limit: 2 },
    '2026-01-02T00:00:00.000Z',
  )
  assert.ok(firstRetrieval.lessons.length > 0)
  assert.equal(suppressedRetrieval.lessons.length, 0)
  const fourth = run(
    cwd,
    observationArgs({
      summary: 'A fourth fixture is ambiguous.',
      evidence: 'The fourth fixture is unresolved.',
      'source-ref': 'fixture:lock-recovery-fourth',
    }),
  )
  run(cwd, [learningScript, 'consolidate', '--harness-version', '1.0'])
  const changedAmbiguity = retrieveLessons(
    cwd,
    { taskClass: 'localized-fix', paths: ['scripts'], limit: 2 },
    '2026-01-03T00:00:00.000Z',
  )
  assert.ok(
    changedAmbiguity.lessons.some(item => item.ambiguousObservationRefs.includes(fourth.observation.observationId)),
  )
})

test('YAML records are portable and bounded retrieval stales, suppresses, then resurfaces lessons', () => {
  const cwd = temporaryDirectory()
  const observation = createLearningObservation(
    {
      taskClass: 'localized-fix',
      kind: 'recovery',
      topic: 'Fixture isolation',
      summary: 'Temporary directories isolate fixtures.',
      evidenceSummary: 'The fixture completed twice.',
      polarity: 'supports',
      paths: ['scripts/tests'],
      sourceType: 'fixture',
      sourceRef: 'fixture:isolation',
      measurements: {},
    },
    '2026-01-01T00:00:00.000Z',
  )
  consolidateObservations(cwd, [observation], '1.0')
  const recordPath = path.join(learningPaths(cwd).lessons, `${readLessons(cwd)[0].metadata.id}.md`)
  assert.ok(fs.existsSync(recordPath))
  assert.equal(YAML.parse(fs.readFileSync(recordPath, 'utf8').split('---\n')[1]).recordType, 'lesson')
  assert.deepEqual(markStaleLessons(cwd, '2026-04-02T00:00:00.000Z').length, 1)
  const first = retrieveLessons(
    cwd,
    { taskClass: 'localized-fix', paths: ['scripts'], harnessVersion: '1.0', limit: 1 },
    '2026-04-02T00:00:00.000Z',
  )
  const sameContext = retrieveLessons(
    cwd,
    { taskClass: 'localized-fix', paths: ['scripts'], harnessVersion: '1.0', limit: 1 },
    '2026-04-03T00:00:00.000Z',
  )
  const newEvidence = createLearningObservation(
    {
      ...observation,
      sourceRef: 'fixture:isolation-new',
      summary: 'A fresh fixture confirmed isolation.',
      evidenceSummary: 'The fresh fixture completed.',
    },
    '2026-04-03T12:00:00.000Z',
  )
  consolidateObservations(cwd, [observation, newEvidence], '1.0')
  const changedEvidence = retrieveLessons(
    cwd,
    { taskClass: 'localized-fix', paths: ['scripts'], harnessVersion: '1.0', limit: 1 },
    '2026-04-04T00:00:00.000Z',
  )
  const later = retrieveLessons(
    cwd,
    { taskClass: 'localized-fix', paths: ['scripts'], harnessVersion: '1.0', limit: 1 },
    '2026-05-05T00:00:00.000Z',
  )
  assert.equal(first.lessons.length, 1)
  assert.equal(sameContext.lessons.length, 0)
  assert.equal(sameContext.suppressed.length, 1)
  assert.equal(changedEvidence.lessons.length, 1)
  assert.equal(later.lessons.length, 1)
  assert.equal(readLessons(cwd)[0].metadata.evidence[0].evidenceSummary, 'The fixture completed twice.')
  assert.deepEqual(validateLearningReferenceIntegrity(cwd, [observation]), {
    lessonCount: 1,
    proposalCount: 0,
    observationCount: 1,
  })
})

test('proposal authority and lifecycle transitions are guarded while task completion stays independent', () => {
  const cwd = temporaryDirectory()
  const proposal = createProposal({
    title: 'Reuse fixture prerequisites',
    problem: 'Repeated fixture setup costs time.',
    supportingRecords: ['obs-0123456789abcdef'],
    suggestedChange: 'Reuse valid setup within one session.',
    expectedBenefit: 'Lower command count.',
    effort: 'small',
    risks: ['incorrect invalidation'],
    acceptanceMeasurements: ['reused setup count'],
    taskClasses: ['localized-fix'],
    paths: ['scripts'],
    supportingEvidence: [
      {
        id: 'obs-0123456789abcdef',
        recordedAt: '2026-01-01T00:00:00.000Z',
        summary: 'Fixture setup repeated.',
        evidenceSummary: 'The command count was observed.',
        sourceType: 'fixture',
        sourceRef: 'fixture:proposal',
        polarity: 'supports',
        measurements: {},
      },
    ],
  })
  writeProposal(cwd, proposal)
  const deferred = transitionProposal(proposal, {
    status: 'deferred',
    reason: 'Another task is more urgent.',
    revisitCondition: 'Revisit after two matching observations.',
  })
  const reopened = transitionProposal(deferred, { status: 'proposed', reason: 'New task boundary supplied evidence.' })
  assert.throws(
    () => transitionProposal(proposal, { status: 'accepted', reason: 'self approval' }),
    /host-conversation authority/,
  )
  const accepted = transitionProposal(reopened, {
    status: 'accepted',
    reason: 'User approved the experiment.',
    authoritySource: 'host-conversation',
    threadId: 'thread-1',
    messageId: 'message-1',
  })
  const implementing = transitionProposal(accepted, { status: 'implementing', reason: 'Approved work began.' })
  const evaluating = transitionProposal(implementing, { status: 'evaluating', reason: 'Focused checks are running.' })
  assert.throws(
    () => transitionProposal(evaluating, { status: 'verified', reason: 'Checks passed.' }),
    /evaluation evidence/,
  )
  assert.equal(
    transitionProposal(evaluating, {
      status: 'verified',
      reason: 'Checks passed.',
      evaluationEvidence: 'Focused checks passed.',
    }).status,
    'verified',
  )
  const completion = run(cwd, [
    learningScript,
    'complete',
    '--task-class',
    'localized-fix',
    '--topic',
    'Completion capture',
    '--summary',
    'Feature finished.',
    '--evidence',
    'Focused tests passed.',
    '--proposal-id',
    proposal.id,
  ])
  assert.equal(completion.completionIndependent, true)
  assert.equal(completion.backloggedProposalId, proposal.id)
})

test('rejected proposals stay suppressed until linked new evidence makes reconsideration contextual', () => {
  const cwd = temporaryDirectory()
  const original = createLearningObservation(
    {
      taskClass: 'localized-fix',
      kind: 'failure',
      topic: 'Reuse setup',
      summary: 'Setup was repeated.',
      evidenceSummary: 'The first run repeated setup.',
      polarity: 'supports',
      paths: ['scripts'],
      sourceType: 'fixture',
      sourceRef: 'fixture:one',
      measurements: {},
    },
    '2026-01-01T00:00:00.000Z',
  )
  const proposal = createProposal(
    {
      title: 'Reuse setup',
      problem: 'Setup repeats.',
      supportingRecords: [original.observationId],
      supportingEvidence: [evidenceSnapshot(original)],
      suggestedChange: 'Reuse valid setup.',
      expectedBenefit: 'Fewer commands.',
      effort: 'small',
      risks: ['stale reuse'],
      acceptanceMeasurements: ['setup count'],
      taskClasses: ['localized-fix'],
      paths: ['scripts'],
    },
    '2026-01-02T00:00:00.000Z',
  )
  const rejected = transitionProposal(
    proposal,
    { status: 'rejected', reason: 'Evidence is insufficient.' },
    '2026-01-03T00:00:00.000Z',
  )
  writeProposal(cwd, rejected)
  const before = retrieveLessons(
    cwd,
    { taskClass: 'localized-fix', paths: ['scripts'], limit: 1 },
    '2026-01-04T00:00:00.000Z',
  )
  assert.deepEqual(before.proposals, [])
  assert.deepEqual(before.suppressedProposals, [proposal.id])
  const newEvidence = createLearningObservation(
    {
      taskClass: 'localized-fix',
      kind: 'success',
      topic: 'Reuse setup',
      summary: 'A second run reused setup.',
      evidenceSummary: 'The second run reduced commands.',
      polarity: 'supports',
      paths: ['scripts'],
      sourceType: 'fixture',
      sourceRef: `proposal:${proposal.id}`,
      proposalId: proposal.id,
      measurements: {},
    },
    '2026-01-05T00:00:00.000Z',
  )
  consolidateObservations(cwd, [newEvidence], '1.0')
  const resurfaced = retrieveLessons(
    cwd,
    { taskClass: 'localized-fix', paths: ['scripts'], limit: 1 },
    '2026-01-06T00:00:00.000Z',
  )
  assert.equal(resurfaced.proposals[0].id, proposal.id)
  assert.equal(resurfaced.proposals[0].reconsideration, true)
  assert.deepEqual(resurfaced.lessons, [])
  const unchanged = retrieveLessons(
    cwd,
    { taskClass: 'localized-fix', paths: ['scripts'], limit: 1 },
    '2026-01-07T00:00:00.000Z',
  )
  assert.deepEqual(unchanged.proposals, [])
  assert.deepEqual(unchanged.suppressedProposals, [proposal.id])
})

test('historical proposal snapshots remain valid after a referenced lesson gains evidence', () => {
  const cwd = temporaryDirectory()
  const first = createLearningObservation(
    {
      taskClass: 'localized-fix',
      kind: 'failure',
      topic: 'Fixture isolation',
      summary: 'The initial fixture leaked state.',
      evidenceSummary: 'The first probe failed.',
      polarity: 'supports',
      paths: ['scripts'],
      sourceType: 'fixture',
      sourceRef: 'fixture:first',
      measurements: {},
    },
    '2026-01-01T00:00:00.000Z',
  )
  consolidateObservations(cwd, [first], '1.0')
  const lesson = readLessons(cwd)[0].metadata
  const proposal = createProposal({
    title: 'Isolate fixtures',
    problem: 'State leaked.',
    supportingRecords: [lesson.id],
    supportingEvidence: [recordSnapshot(lesson)],
    suggestedChange: 'Use temporary directories.',
    expectedBenefit: 'Stable tests.',
    effort: 'small',
    risks: ['cleanup defect'],
    acceptanceMeasurements: ['isolated fixture count'],
    taskClasses: ['localized-fix'],
    paths: ['scripts'],
  })
  writeProposal(cwd, proposal)
  const later = createLearningObservation(
    {
      ...first,
      sourceRef: 'fixture:second',
      summary: 'The second fixture confirmed isolation.',
      evidenceSummary: 'The second probe passed.',
    },
    '2026-01-02T00:00:00.000Z',
  )
  consolidateObservations(cwd, [first, later], '1.0')
  assert.deepEqual(validateLearningReferenceIntegrity(cwd, [first, later]).proposalCount, 1)
})

test('retrieval excludes unrelated, verified, and superseded records while reserving space for reconsideration', () => {
  const cwd = temporaryDirectory()
  const observation = createLearningObservation({
    taskClass: 'localized-fix',
    kind: 'failure',
    topic: 'Relevant lesson',
    summary: 'Relevant fixture evidence.',
    evidenceSummary: 'The relevant fixture failed.',
    polarity: 'supports',
    paths: ['scripts'],
    sourceType: 'fixture',
    sourceRef: 'fixture:relevant',
    measurements: {},
  })
  const unrelated = createLearningObservation({
    taskClass: 'cross-module-feature',
    kind: 'failure',
    topic: 'Unrelated lesson',
    summary: 'Unrelated fixture evidence.',
    evidenceSummary: 'The unrelated fixture failed.',
    polarity: 'supports',
    paths: ['src'],
    sourceType: 'fixture',
    sourceRef: 'fixture:unrelated',
    measurements: {},
  })
  consolidateObservations(cwd, [observation, unrelated], '1.0')
  const proposalInput = {
    problem: 'Setup repeats.',
    supportingRecords: [observation.observationId],
    supportingEvidence: [evidenceSnapshot(observation)],
    suggestedChange: 'Reuse setup.',
    expectedBenefit: 'Fewer commands.',
    effort: 'small',
    risks: ['stale setup'],
    acceptanceMeasurements: ['setup count'],
    taskClasses: ['localized-fix'],
    paths: ['scripts'],
  }
  const verifiedBase = createProposal({ ...proposalInput, title: 'Verified setup reuse' })
  const accepted = transitionProposal(verifiedBase, {
    status: 'accepted',
    reason: 'Approved.',
    authoritySource: 'host-conversation',
    threadId: 'thread',
    messageId: 'message',
  })
  const implementing = transitionProposal(accepted, { status: 'implementing', reason: 'Started.' })
  const evaluating = transitionProposal(implementing, { status: 'evaluating', reason: 'Checked.' })
  writeProposal(
    cwd,
    transitionProposal(evaluating, {
      status: 'verified',
      reason: 'Passed.',
      evaluationEvidence: 'Focused checks passed.',
    }),
  )
  const superseded = transitionProposal(createProposal({ ...proposalInput, title: 'Superseded setup reuse' }), {
    status: 'superseded',
    reason: 'Replaced.',
  })
  writeProposal(cwd, superseded)
  const unrelatedQuery = retrieveLessons(cwd, { taskClass: 'architecture-review', paths: ['docs'], limit: 3 })
  assert.deepEqual(unrelatedQuery.lessons, [])
  assert.deepEqual(unrelatedQuery.proposals, [])
  const relevantQuery = retrieveLessons(cwd, { taskClass: 'localized-fix', paths: ['scripts'], limit: 3 })
  assert.deepEqual(relevantQuery.proposals, [])
})

test('neutral repeats remain low confidence and contradictions resurface a stale lesson', () => {
  const cwd = temporaryDirectory()
  const neutral = createLearningObservation(
    {
      taskClass: 'localized-fix',
      kind: 'development-cost',
      topic: 'Neutral repeat',
      summary: 'One neutral observation.',
      evidenceSummary: 'The first measurement was incomplete.',
      polarity: 'neutral',
      paths: ['scripts'],
      sourceType: 'fixture',
      sourceRef: 'fixture:neutral-one',
      measurements: {},
    },
    '2026-01-01T00:00:00.000Z',
  )
  const repeat = createLearningObservation(
    {
      ...neutral,
      sourceRef: 'fixture:neutral-two',
      summary: 'A second neutral observation.',
      evidenceSummary: 'The second measurement was incomplete.',
    },
    '2026-01-02T00:00:00.000Z',
  )
  consolidateObservations(cwd, [neutral, repeat], '1.0')
  const lesson = readLessons(cwd)[0].metadata
  assert.equal(lesson.confidence, 'low')
  retrieveLessons(cwd, { taskClass: 'localized-fix', paths: ['scripts'], limit: 1 }, '2026-01-03T00:00:00.000Z')
  const contradiction = createLearningObservation(
    {
      ...neutral,
      sourceRef: 'fixture:contradiction',
      summary: 'A counterexample was found.',
      evidenceSummary: 'The counterexample disproved the assumption.',
      polarity: 'contradicts',
    },
    '2026-01-04T00:00:00.000Z',
  )
  consolidateObservations(cwd, [neutral, repeat, contradiction], '1.0')
  const resurfaced = retrieveLessons(
    cwd,
    { taskClass: 'localized-fix', paths: ['scripts'], limit: 1 },
    '2026-01-05T00:00:00.000Z',
  )
  assert.equal(resurfaced.lessons.length, 1)
  assert.equal(resurfaced.lessons[0].status, 'stale')
  assert.equal(resurfaced.lessons[0].confidence, 'low')
})

test('Markdown proposal status must match a continuous authorized history', () => {
  const observation = createLearningObservation({
    taskClass: 'localized-fix',
    kind: 'failure',
    topic: 'History integrity',
    summary: 'A fixture supplied evidence.',
    evidenceSummary: 'The focused run failed.',
    polarity: 'supports',
    paths: ['scripts'],
    sourceType: 'fixture',
    sourceRef: 'fixture:history',
    measurements: {},
  })
  const proposal = createProposal({
    title: 'History integrity',
    problem: 'History can drift.',
    supportingRecords: [observation.observationId],
    supportingEvidence: [evidenceSnapshot(observation)],
    suggestedChange: 'Validate history.',
    expectedBenefit: 'Tampering fails.',
    effort: 'small',
    risks: ['false rejection'],
    acceptanceMeasurements: ['invalid record failure'],
    taskClasses: ['localized-fix'],
    paths: ['scripts'],
  })
  assert.throws(() => validateProposal({ ...proposal, status: 'accepted' }), /final history state/)
  const invalidTransition = structuredClone(proposal)
  invalidTransition.status = 'implementing'
  invalidTransition.history.push({
    at: '2027-01-02T00:00:00.000Z',
    from: 'proposed',
    to: 'implementing',
    reason: 'Hand edited.',
    revisitCondition: null,
    authority: null,
    evidence: null,
  })
  assert.throws(() => validateProposal(invalidTransition), /illegal transition/)
  const invalidDeferred = structuredClone(proposal)
  invalidDeferred.status = 'deferred'
  invalidDeferred.history.push({
    at: '2027-01-02T00:00:00.000Z',
    from: 'proposed',
    to: 'deferred',
    reason: 'Hand edited.',
    revisitCondition: null,
    authority: null,
    evidence: null,
  })
  assert.throws(() => validateProposal(invalidDeferred), /revisitCondition/)
})

test('core revalidation rejects neutral and contradictory evidence', () => {
  const cwd = temporaryDirectory()
  const original = createLearningObservation({
    taskClass: 'localized-fix',
    kind: 'failure',
    topic: 'Revalidation polarity',
    summary: 'The initial observation supports the lesson.',
    evidenceSummary: 'The initial focused check failed.',
    polarity: 'supports',
    paths: ['scripts'],
    sourceType: 'fixture',
    sourceRef: 'fixture:initial',
    measurements: {},
  })
  consolidateObservations(cwd, [original], '1.0')
  const lesson = readLessons(cwd)[0].metadata
  for (const polarity of ['neutral', 'contradicts']) {
    const candidate = createLearningObservation({
      ...original,
      sourceRef: `fixture:${polarity}`,
      summary: `${polarity} evidence cannot revalidate.`,
      evidenceSummary: `${polarity} evidence was captured.`,
      polarity,
    })
    assert.throws(() => revalidateLesson(cwd, lesson.id, candidate), /must support the lesson/)
  }
})

test('record loading rejects hand-edited confidence, unsupported active lessons, and unknown observation fields', () => {
  const observation = createLearningObservation({
    taskClass: 'localized-fix',
    kind: 'failure',
    topic: 'Load invariants',
    summary: 'One support exists.',
    evidenceSummary: 'The focused check supports it.',
    polarity: 'supports',
    paths: ['scripts'],
    sourceType: 'fixture',
    sourceRef: 'fixture:load',
    measurements: {},
  })
  const lesson = lessonFromObservation(observation, '1.0')
  assert.throws(() => validateLesson({ ...lesson, confidence: 'high' }), /high confidence requires two/)
  const legacy = structuredClone(lesson)
  legacy.evidence[0].sourceType = 'legacy-run-evolution'
  assert.throws(() => validateLesson(legacy), /legacy evidence requires stale low confidence/)
  const neutral = structuredClone(lesson)
  neutral.evidence[0].polarity = 'neutral'
  neutral.confidence = 'low'
  assert.throws(() => validateLesson(neutral), /unsupported lessons require stale low confidence/)
  const unknown = { ...observation, rawTranscript: 'Bearer secret-value /Users/person/repo' }
  assert.throws(() => validateLearningObservation(unknown), /unknown metadata field/)
  assert.throws(() => validateJournalLearningObservation(unknown), /unknown field/)
})

test('neutral and legacy observations remain stale, and neutral evidence does not refresh validation time', () => {
  const cwd = temporaryDirectory()
  const support = createLearningObservation(
    {
      taskClass: 'localized-fix',
      kind: 'failure',
      topic: 'Evidence freshness',
      summary: 'Supporting evidence.',
      evidenceSummary: 'A focused check passed.',
      polarity: 'supports',
      paths: ['scripts'],
      sourceType: 'fixture',
      sourceRef: 'fixture:support',
      measurements: {},
    },
    '2026-01-01T00:00:00.000Z',
  )
  const neutral = createLearningObservation(
    {
      ...support,
      summary: 'Neutral follow-up.',
      evidenceSummary: 'The follow-up was inconclusive.',
      polarity: 'neutral',
      sourceRef: 'fixture:neutral',
    },
    '2026-06-01T00:00:00.000Z',
  )
  const neutralLesson = lessonFromObservation(neutral, '1.0')
  assert.equal(neutralLesson.status, 'stale')
  assert.equal(neutralLesson.confidence, 'low')
  const legacyLesson = lessonFromObservation(
    createLearningObservation({ ...support, sourceType: 'legacy-run-evolution', sourceRef: 'run:legacy' }),
    '1.0',
  )
  assert.equal(legacyLesson.status, 'stale')
  assert.equal(legacyLesson.confidence, 'low')
  consolidateObservations(cwd, [support, neutral], '1.0')
  const merged = readLessons(cwd)[0].metadata
  assert.equal(merged.status, 'active')
  assert.equal(merged.lastValidatedAt, support.recordedAt)
})

test('explicit later revalidation resolves historical counterexamples without erasing them', () => {
  const cwd = temporaryDirectory()
  const support = createLearningObservation(
    {
      taskClass: 'localized-fix',
      kind: 'failure',
      topic: 'Counterexample resolution',
      summary: 'Initial support.',
      evidenceSummary: 'Initial check passed.',
      polarity: 'supports',
      paths: ['scripts'],
      sourceType: 'fixture',
      sourceRef: 'fixture:support',
      measurements: {},
    },
    '2026-01-01T00:00:00.000Z',
  )
  const counterexample = createLearningObservation(
    {
      ...support,
      sourceRef: 'fixture:counter',
      summary: 'Counterexample.',
      evidenceSummary: 'Counterexample found.',
      polarity: 'contradicts',
    },
    '2026-01-02T00:00:00.000Z',
  )
  consolidateObservations(cwd, [support, counterexample], '1.0')
  const stale = readLessons(cwd)[0].metadata
  assert.equal(stale.status, 'stale')
  const revalidation = createLearningObservation(
    {
      ...support,
      sourceType: 'lesson-revalidation',
      sourceRef: `lesson:${stale.id}`,
      summary: 'Revalidated support.',
      evidenceSummary: 'New focused check passed.',
      polarity: 'supports',
    },
    '2026-01-03T00:00:00.000Z',
  )
  revalidateLesson(cwd, stale.id, revalidation)
  const laterSupport = createLearningObservation(
    {
      ...support,
      sourceRef: 'fixture:later',
      summary: 'Later support.',
      evidenceSummary: 'Later check passed.',
      polarity: 'supports',
    },
    '2026-01-04T00:00:00.000Z',
  )
  consolidateObservations(cwd, [support, counterexample, revalidation, laterSupport], '1.0')
  const resolved = readLessons(cwd)[0].metadata
  assert.equal(resolved.status, 'active')
  assert.equal(resolved.revalidationEvidenceRef, revalidation.observationId)
  assert.ok(resolved.counterexampleRefs.includes(counterexample.observationId))
  assert.equal(resolved.lastValidatedAt, laterSupport.recordedAt)
})

test('a later counterexample stales a revalidated lesson while later support refreshes its evidence time', () => {
  const cwd = temporaryDirectory()
  const support = createLearningObservation(
    {
      taskClass: 'localized-fix',
      kind: 'failure',
      topic: 'Chronological counterexamples',
      summary: 'Initial support.',
      evidenceSummary: 'Initial focused check passed.',
      polarity: 'supports',
      paths: ['scripts'],
      sourceType: 'fixture',
      sourceRef: 'fixture:initial',
      measurements: {},
    },
    '2026-01-01T00:00:00.000Z',
  )
  consolidateObservations(cwd, [support], '1.0')
  const initial = readLessons(cwd)[0].metadata
  const revalidation = createLearningObservation(
    {
      ...support,
      sourceType: 'lesson-revalidation',
      sourceRef: `lesson:${initial.id}`,
      summary: 'Revalidated support.',
      evidenceSummary: 'Explicit revalidation passed.',
    },
    '2026-02-01T00:00:00.000Z',
  )
  revalidateLesson(cwd, initial.id, revalidation)
  const counterexample = createLearningObservation(
    {
      ...support,
      sourceRef: 'fixture:counterexample',
      summary: 'A later counterexample was found.',
      evidenceSummary: 'The later focused check contradicted the lesson.',
      polarity: 'contradicts',
    },
    '2026-03-01T00:00:00.000Z',
  )
  consolidateObservations(cwd, [counterexample], '1.0')
  const contradicted = readLessons(cwd)[0].metadata
  assert.equal(contradicted.status, 'stale')
  assert.equal(contradicted.confidence, 'low')
  assert.equal(contradicted.lastValidatedAt, revalidation.recordedAt)
  const laterSupport = createLearningObservation(
    {
      ...support,
      sourceRef: 'fixture:later-support',
      summary: 'Later supporting evidence.',
      evidenceSummary: 'A later focused check passed.',
    },
    '2026-04-01T00:00:00.000Z',
  )
  assert.doesNotThrow(() => consolidateObservations(cwd, [laterSupport], '1.0'))
  const refreshed = readLessons(cwd)[0].metadata
  assert.equal(refreshed.status, 'stale')
  assert.equal(refreshed.confidence, 'low')
  assert.equal(refreshed.revalidationEvidenceRef, revalidation.observationId)
  assert.equal(refreshed.lastValidatedAt, laterSupport.recordedAt)
})
