#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { validateLearningReferenceIntegrity } from './lib/harness-learning.mjs'
import { readJournal } from './lib/swarm-ledger-store.mjs'

const journalPath = path.join(process.cwd(), '.appraisejs', 'swarm-events.jsonl')
const journal = fs.existsSync(journalPath) ? readJournal(journalPath) : { observations: new Map(), runs: new Map() }
const sourceObservedAtByRef = new Map([...journal.runs.values()].map(run => [`run:${run.runId}`, run.recordedAt]))
const result = validateLearningReferenceIntegrity(
  process.cwd(),
  [...journal.observations.values()],
  sourceObservedAtByRef,
)
console.log(
  `Harness learning check passed (${result.lessonCount} lessons, ${result.proposalCount} proposals, ${result.observationCount} local observations validated).`,
)
