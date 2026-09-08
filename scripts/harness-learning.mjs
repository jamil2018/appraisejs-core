#!/usr/bin/env node

import { parseStrictArgs } from './lib/swarm-cli.mjs'
import { withLockedSwarmJournal } from './lib/swarm-ledger-access.mjs'
import { appendEvent } from './lib/swarm-ledger-store.mjs'
import {
  consolidateObservations,
  createLearningObservation,
  createProposal,
  evidenceSnapshot,
  markStaleLessons,
  readLessons,
  readProposals,
  recordSnapshot,
  revalidateLesson,
  retrieveLessons,
  sanitizeLegacyText,
  transitionProposal,
  validateLearningReferenceIntegrity,
  writeProposal,
} from './lib/harness-learning.mjs'

const [command, ...argv] = process.argv.slice(2)
const commands = new Set([
  'record-observation',
  'migrate',
  'consolidate',
  'lessons',
  'revalidate-lesson',
  'propose',
  'list-proposals',
  'show-proposal',
  'transition-proposal',
  'evaluate',
  'complete',
])
if (!commands.has(command) || argv.includes('--help')) {
  console.log(`Usage: node scripts/harness-learning.mjs <command> [options]

Commands:
  record-observation  Capture sanitized local advisory evidence.
  migrate             Import pending legacy evolution observations once.
  consolidate         Synthesize journal evidence into Markdown lessons.
  lessons             Retrieve a bounded, contextual lesson set.
  revalidate-lesson   Mark a stale lesson active with evidence.
  propose             Create an advisory improvement proposal.
  list-proposals      List proposal metadata.
  show-proposal       Show one proposal.
  transition-proposal Move a proposal through its guarded lifecycle.
  evaluate            Record a terminal evaluation from evaluating.
  complete            Capture completion evidence while leaving proposals backlogged.`)
  process.exit(command ? 0 : 1)
}

const definitions = {
  'record-observation': {
    'task-class': { required: true },
    kind: { required: true },
    topic: { required: true },
    summary: { required: true },
    evidence: { required: true },
    polarity: {},
    path: { multiple: true },
    'proposal-id': {},
    'source-type': { required: true },
    'source-ref': { required: true },
    measurement: { multiple: true },
  },
  migrate: {},
  consolidate: { 'harness-version': { required: true } },
  lessons: { 'task-class': {}, path: { multiple: true }, 'harness-version': {}, limit: {} },
  'revalidate-lesson': { id: { required: true }, evidence: { required: true } },
  propose: {
    title: { required: true },
    problem: { required: true },
    'supporting-record': { multiple: true },
    'suggested-change': { required: true },
    'expected-benefit': { required: true },
    effort: { required: true },
    risk: { multiple: true },
    'acceptance-measurement': { multiple: true },
    'task-class': { multiple: true },
    path: { multiple: true },
  },
  'list-proposals': { status: {} },
  'show-proposal': { id: { required: true } },
  'transition-proposal': {
    id: { required: true },
    status: { required: true },
    reason: { required: true },
    'revisit-condition': {},
    'authority-source': {},
    'thread-id': {},
    'message-id': {},
  },
  evaluate: {
    id: { required: true },
    status: { required: true },
    reason: { required: true },
    evidence: { required: true },
  },
  complete: {
    'task-class': { required: true },
    summary: { required: true },
    evidence: { required: true },
    topic: { required: true },
    path: { multiple: true },
    'proposal-id': {},
  },
}
const values = parseStrictArgs(argv, definitions[command])
const root = process.cwd()

function measurements(items = []) {
  const parsed = {}
  for (const item of items) {
    const match = item.match(/^([a-z][a-z0-9-]{0,63})=(unknown|\d+(?:\.\d+)?)$/)
    if (!match) throw new Error(`Invalid measurement: ${item}`)
    parsed[match[1]] = match[2] === 'unknown' ? null : Number(match[2])
  }
  return parsed
}

function appendObservation(input) {
  return withLockedSwarmJournal((journal, journalPath) => {
    const observation = createLearningObservation(input)
    if (journal.observations.has(observation.observationId)) return { observation, recorded: false }
    appendEvent(journalPath, { kind: 'learning.observation', observation }, journal.lastHash)
    return { observation, recorded: true }
  })
}

function sourceObservedAtByRef(journal) {
  return new Map([...journal.runs.values()].map(run => [`run:${run.runId}`, run.recordedAt]))
}

function observationInput(overrides = {}) {
  return {
    taskClass: values['task-class'],
    kind: values.kind,
    topic: values.topic,
    summary: values.summary,
    evidenceSummary: values.evidence,
    polarity: values.polarity ?? 'neutral',
    paths: values.path ?? [],
    sourceType: values['source-type'],
    sourceRef: values['source-ref'],
    measurements: measurements(values.measurement),
    proposalId: values['proposal-id'],
    ...overrides,
  }
}

let result
if (command === 'record-observation') {
  if (values['proposal-id'] && !readProposals(root).some(item => item.metadata.id === values['proposal-id'])) {
    throw new Error(`Unknown proposal: ${values['proposal-id']}`)
  }
  result = appendObservation(observationInput())
} else if (command === 'migrate') {
  result = withLockedSwarmJournal((journal, journalPath) => {
    const imported = []
    const skipped = []
    let previousHash = journal.lastHash
    for (const run of journal.runs.values()) {
      if (!run.evolution.notificationRequired || run.evolution.phase === 'verified') continue
      for (const [index, legacy] of run.evolution.observations.entries()) {
        const migrationKey = `${run.runId}:evolution:${index}`
        const observation = createLearningObservation({
          taskClass: run.taskClass,
          observedAt: run.recordedAt,
          kind: legacy.severity === 'critical' || legacy.severity === 'material' ? 'failure' : 'development-cost',
          topic: sanitizeLegacyText(`${legacy.domain}: ${legacy.summary}`),
          summary: sanitizeLegacyText(legacy.summary),
          evidenceSummary: sanitizeLegacyText(legacy.evidence),
          polarity: legacy.severity === 'critical' ? 'contradicts' : 'neutral',
          paths: [],
          sourceType: 'legacy-run-evolution',
          sourceRef: `run:${run.runId}`,
          ...(run.evolution.userGuidance ? { guidance: sanitizeLegacyText(run.evolution.userGuidance) } : {}),
          measurements: {},
          migrationKey,
        })
        if (journal.observations.has(observation.observationId)) {
          skipped.push(observation.observationId)
          continue
        }
        const event = appendEvent(journalPath, { kind: 'learning.observation', observation }, previousHash)
        previousHash = event.hash
        imported.push(observation.observationId)
      }
    }
    return { imported, skipped }
  })
} else if (command === 'consolidate') {
  result = withLockedSwarmJournal(journal => {
    const sourceTimes = sourceObservedAtByRef(journal)
    const consolidated = consolidateObservations(root, [...journal.observations.values()], values['harness-version'], {
      sourceObservedAtByRef: sourceTimes,
    })
    return {
      ...consolidated,
      integrity: validateLearningReferenceIntegrity(root, [...journal.observations.values()], sourceTimes),
    }
  })
} else if (command === 'lessons') {
  const limit = values.limit === undefined ? 3 : Number(values.limit)
  result = {
    stale: markStaleLessons(root),
    integrity: withLockedSwarmJournal(journal =>
      validateLearningReferenceIntegrity(root, [...journal.observations.values()], sourceObservedAtByRef(journal)),
    ),
    ...retrieveLessons(root, {
      taskClass: values['task-class'],
      paths: values.path ?? [],
      harnessVersion: values['harness-version'],
      limit,
    }),
  }
} else if (command === 'revalidate-lesson') {
  const lesson = readLessons(root).find(item => item.metadata.id === values.id)
  if (!lesson) throw new Error(`Unknown lesson: ${values.id}`)
  const captured = appendObservation({
    taskClass: lesson.metadata.taskClasses[0] ?? 'harness-configuration',
    kind: 'recovery',
    topic: lesson.metadata.title,
    summary: `Lesson revalidated: ${values.evidence}`,
    evidenceSummary: values.evidence,
    polarity: 'supports',
    paths: lesson.metadata.paths,
    sourceType: 'lesson-revalidation',
    sourceRef: `lesson:${values.id}`,
    measurements: {},
  })
  result = { lesson: revalidateLesson(root, values.id, captured.observation), observationRecorded: captured.recorded }
} else if (command === 'propose') {
  const supportingRecords = values['supporting-record'] ?? []
  const supportingEvidence = withLockedSwarmJournal(journal => {
    const records = new Map(
      [...journal.observations.values()].map(item => [item.observationId, evidenceSnapshot(item)]),
    )
    for (const { metadata } of readLessons(root)) records.set(metadata.id, recordSnapshot(metadata))
    for (const { metadata } of readProposals(root)) records.set(metadata.id, recordSnapshot(metadata))
    return supportingRecords.map(reference => {
      const snapshot = records.get(reference)
      if (!snapshot) throw new Error(`Unknown supporting record: ${reference}`)
      return snapshot
    })
  })
  const proposal = createProposal({
    title: values.title,
    problem: values.problem,
    supportingRecords,
    supportingEvidence,
    suggestedChange: values['suggested-change'],
    expectedBenefit: values['expected-benefit'],
    effort: values.effort,
    risks: values.risk ?? [],
    acceptanceMeasurements: values['acceptance-measurement'] ?? [],
    taskClasses: values['task-class'] ?? [],
    paths: values.path ?? [],
  })
  const existing = readProposals(root).find(item => item.metadata.id === proposal.id)
  if (existing) result = { proposal: existing.metadata, recorded: false }
  else result = { proposal, recorded: true, filePath: writeProposal(root, proposal) }
} else if (command === 'list-proposals') {
  result = readProposals(root)
    .map(item => item.metadata)
    .filter(item => !values.status || item.status === values.status)
} else if (command === 'show-proposal') {
  const proposal = readProposals(root).find(item => item.metadata.id === values.id)
  if (!proposal) throw new Error(`Unknown proposal: ${values.id}`)
  result = proposal.metadata
} else if (command === 'transition-proposal' || command === 'evaluate') {
  const proposal = readProposals(root).find(item => item.metadata.id === values.id)
  if (!proposal) throw new Error(`Unknown proposal: ${values.id}`)
  const next = transitionProposal(proposal.metadata, {
    status: values.status,
    reason: values.reason,
    revisitCondition: values['revisit-condition'],
    authoritySource: values['authority-source'],
    threadId: values['thread-id'],
    messageId: values['message-id'],
    evaluationEvidence: values.evidence ?? values['evaluation-evidence'],
  })
  result = { proposal: next, filePath: writeProposal(root, next) }
} else {
  if (values['proposal-id'] && !readProposals(root).some(item => item.metadata.id === values['proposal-id'])) {
    throw new Error(`Unknown proposal: ${values['proposal-id']}`)
  }
  result = {
    ...appendObservation({
      taskClass: values['task-class'],
      kind: 'success',
      topic: values.topic,
      summary: values.summary,
      evidenceSummary: values.evidence,
      polarity: 'neutral',
      paths: values.path ?? [],
      sourceType: 'task-completion',
      sourceRef: values['proposal-id'] ? `proposal:${values['proposal-id']}` : 'no-proposal',
      measurements: {},
      proposalId: values['proposal-id'],
    }),
    completionIndependent: true,
    backloggedProposalId: values['proposal-id'] ?? null,
  }
}
console.log(JSON.stringify(result))
