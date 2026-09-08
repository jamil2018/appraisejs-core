import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { assertSanitizedLearningText, sanitizeLegacyLearningText } from './harness-learning-sanitization.mjs'

export const LEARNING_SCHEMA_VERSION = 1
export const LESSON_STATUSES = new Set(['active', 'stale'])
export const PROPOSAL_STATUSES = new Set([
  'proposed',
  'deferred',
  'accepted',
  'implementing',
  'evaluating',
  'verified',
  'rejected',
  'superseded',
])
export const REMINDER_SUPPRESSION_DAYS = 30
export const STALE_AFTER_DAYS = 90

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function safeText(value, label, limit = 1200) {
  return assertSanitizedLearningText(value, label, limit)
}

function safeArray(value, label) {
  assert(Array.isArray(value), `${label}: expected array`)
  value.forEach((item, index) => safeText(item, `${label}[${index}]`))
  return [...new Set(value.map(item => item.trim()))]
}

function safePaths(value, label) {
  const paths = safeArray(value, label)
  paths.forEach(item => assert(!item.startsWith('/') && !item.includes('..'), `${label}: invalid relative path`))
  return paths
}

function safeDate(value, label) {
  assert(Number.isFinite(Date.parse(value)), `${label}: invalid date`)
  return value
}

function stableId(prefix, source) {
  return `${prefix}-${crypto.createHash('sha256').update(source).digest('hex').slice(0, 16)}`
}

export function learningPaths(root = process.cwd()) {
  const base = path.join(root, 'docs', 'development-harness')
  return { base, lessons: path.join(base, 'lessons'), proposals: path.join(base, 'improvements') }
}

export function sanitizeLegacyText(value) {
  return sanitizeLegacyLearningText(value)
}

export function validateLearningObservation(observation, label = 'learning observation') {
  assert(observation && typeof observation === 'object', `${label}: expected object`)
  assertOnlyKeys(
    observation,
    new Set([
      'observationId',
      'recordedAt',
      'observedAt',
      'taskClass',
      'kind',
      'topic',
      'summary',
      'evidenceSummary',
      'polarity',
      'paths',
      'sourceType',
      'sourceRef',
      'measurements',
      'migrationKey',
      'proposalId',
      'guidance',
    ]),
    label,
  )
  assert(/^obs-[a-f0-9]{16}$/.test(observation.observationId), `${label}: invalid observationId`)
  safeDate(observation.recordedAt, `${label}: recordedAt`)
  if (observation.observedAt !== undefined) safeDate(observation.observedAt, `${label}: observedAt`)
  safeText(observation.taskClass, `${label}: taskClass`, 100)
  assert(
    ['success', 'failure', 'recovery', 'repeated-work', 'development-cost'].includes(observation.kind),
    `${label}: invalid kind`,
  )
  safeText(observation.topic, `${label}: topic`, 160)
  safeText(observation.summary, `${label}: summary`)
  safeText(observation.evidenceSummary, `${label}: evidenceSummary`)
  assert(['supports', 'contradicts', 'neutral'].includes(observation.polarity), `${label}: invalid polarity`)
  safePaths(observation.paths, `${label}: paths`)
  safeText(observation.sourceType, `${label}: sourceType`, 100)
  safeText(observation.sourceRef, `${label}: sourceRef`, 200)
  assert(observation.measurements && typeof observation.measurements === 'object', `${label}: invalid measurements`)
  for (const [name, value] of Object.entries(observation.measurements)) {
    assert(/^[a-z][a-z0-9-]{0,63}$/.test(name), `${label}: invalid measurement name`)
    assert(value === null || (Number.isFinite(value) && value >= 0), `${label}: invalid measurement ${name}`)
  }
  if (observation.migrationKey !== undefined) safeText(observation.migrationKey, `${label}: migrationKey`, 240)
  if (observation.guidance !== undefined) safeText(observation.guidance, `${label}: guidance`)
  if (observation.proposalId !== undefined) {
    assert(/^proposal-[a-f0-9]{16}$/.test(observation.proposalId), `${label}: invalid proposalId`)
  }
  return observation
}

export function createLearningObservation(input, now = new Date().toISOString()) {
  const normalized = {
    observationId: stableId(
      'obs',
      `${input.sourceType}|${input.sourceRef}|${input.migrationKey ?? ''}|${input.topic}|${input.summary}`,
    ),
    recordedAt: now,
    ...(input.observedAt ? { observedAt: input.observedAt } : {}),
    taskClass: input.taskClass.trim(),
    kind: input.kind,
    topic: input.topic.trim(),
    summary: input.summary.trim(),
    evidenceSummary: input.evidenceSummary.trim(),
    polarity: input.polarity ?? 'neutral',
    paths: [...new Set((input.paths ?? []).map(item => item.trim()))],
    sourceType: input.sourceType.trim(),
    sourceRef: input.sourceRef.trim(),
    measurements: input.measurements ?? {},
    ...(input.migrationKey ? { migrationKey: input.migrationKey.trim() } : {}),
    ...(input.guidance ? { guidance: input.guidance.trim() } : {}),
    ...(input.proposalId ? { proposalId: input.proposalId.trim() } : {}),
  }
  return validateLearningObservation(normalized)
}

function parseRecord(filePath, expectedType) {
  const source = fs.readFileSync(filePath, 'utf8')
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  assert(match, `${filePath}: expected YAML front matter`)
  const document = YAML.parseDocument(match[1], { maxAliasCount: 0, prettyErrors: false })
  assert(!document.errors.length, `${filePath}: invalid YAML metadata`)
  const metadata = document.toJS({ maxAliasCount: 0 })
  assert(metadata && typeof metadata === 'object' && !Array.isArray(metadata), `${filePath}: expected YAML object`)
  if (expectedType === 'lesson') validateLesson(metadata, filePath)
  else validateProposal(metadata, filePath)
  return { metadata, body: match[2], filePath }
}

function assertOnlyKeys(value, allowed, label) {
  for (const key of Object.keys(value)) assert(allowed.has(key), `${label}: unknown metadata field ${key}`)
}

function validateOptionalDate(value, label) {
  if (value !== null && value !== undefined) safeDate(value, label)
}

export function validateLesson(record, label = 'lesson') {
  assertOnlyKeys(
    record,
    new Set([
      'schemaVersion',
      'recordType',
      'id',
      'title',
      'topic',
      'status',
      'taskClasses',
      'paths',
      'harnessVersion',
      'confidence',
      'evidenceRefs',
      'counterexampleRefs',
      'ambiguousObservationRefs',
      'lastValidatedAt',
      'lastResurfacedAt',
      'reminderFingerprint',
      'evidence',
      'revalidationEvidenceRef',
    ]),
    label,
  )
  assert(record.schemaVersion === LEARNING_SCHEMA_VERSION, `${label}: unsupported schemaVersion`)
  assert(record.recordType === 'lesson', `${label}: invalid recordType`)
  assert(/^lesson-[a-f0-9]{16}$/.test(record.id), `${label}: invalid id`)
  for (const field of ['title', 'topic', 'harnessVersion']) safeText(record[field], `${label}: ${field}`, 240)
  assert(LESSON_STATUSES.has(record.status), `${label}: invalid status`)
  safeArray(record.taskClasses, `${label}: taskClasses`)
  safePaths(record.paths, `${label}: paths`)
  assert(['low', 'medium', 'high'].includes(record.confidence), `${label}: invalid confidence`)
  for (const field of ['evidenceRefs', 'counterexampleRefs', 'ambiguousObservationRefs'])
    safeArray(record[field], `${label}: ${field}`)
  validateEvidenceSnapshots(record.evidence, `${label}: evidence`)
  assert(
    sameReferences(
      record.evidence.map(item => item.id),
      [...record.evidenceRefs, ...record.counterexampleRefs, ...record.ambiguousObservationRefs],
    ),
    `${label}: evidence references do not match embedded evidence`,
  )
  safeDate(record.lastValidatedAt, `${label}: lastValidatedAt`)
  validateLessonSemantics(record, label)
  validateOptionalDate(record.lastResurfacedAt, `${label}: lastResurfacedAt`)
  if (record.reminderFingerprint !== null && record.reminderFingerprint !== undefined)
    safeText(record.reminderFingerprint, `${label}: reminderFingerprint`, 500)
  return record
}

function evidenceTime(item) {
  return item.observedAt ?? item.recordedAt
}

function validateLessonSemantics(record, label) {
  const supporting = record.evidence.filter(item => item.polarity === 'supports')
  if (!supporting.length)
    assert(
      record.status === 'stale' && record.confidence === 'low',
      `${label}: unsupported lessons require stale low confidence`,
    )
  if (record.confidence === 'medium')
    assert(supporting.length >= 1, `${label}: medium confidence requires supporting evidence`)
  if (record.confidence === 'high')
    assert(supporting.length >= 2, `${label}: high confidence requires two supporting evidence records`)
  const revalidation = record.revalidationEvidenceRef
    ? record.evidence.find(item => item.id === record.revalidationEvidenceRef)
    : null
  if (record.revalidationEvidenceRef !== null && record.revalidationEvidenceRef !== undefined) {
    safeText(record.revalidationEvidenceRef, `${label}: revalidationEvidenceRef`)
    assert(revalidation, `${label}: revalidation evidence reference is not embedded`)
    assert(
      revalidation.polarity === 'supports' && revalidation.sourceType !== 'legacy-run-evolution',
      `${label}: revalidation evidence must be nonlegacy support`,
    )
  }
  const latestCounterexample = record.evidence
    .filter(item => record.counterexampleRefs.includes(item.id))
    .map(evidenceTime)
    .sort()
    .at(-1)
  if (
    latestCounterexample &&
    !(revalidation && Date.parse(evidenceTime(revalidation)) >= Date.parse(latestCounterexample))
  ) {
    assert(
      record.status === 'stale' && record.confidence === 'low',
      `${label}: unresolved counterexamples require stale low confidence`,
    )
  }
  const containsLegacy = record.evidence.some(item => item.sourceType === 'legacy-run-evolution')
  assert(
    !containsLegacy || revalidation || (record.status === 'stale' && record.confidence === 'low'),
    `${label}: legacy evidence requires stale low confidence until explicit revalidation`,
  )
  const nonlegacySupports = supporting.filter(item => item.sourceType !== 'legacy-run-evolution')
  const validTimes = (nonlegacySupports.length ? nonlegacySupports : record.evidence).map(evidenceTime)
  assert(validTimes.includes(record.lastValidatedAt), `${label}: lastValidatedAt must match embedded evidence time`)
}

function validateHistory(history, label) {
  assert(Array.isArray(history), `${label}: expected array`)
  history.forEach((entry, index) => {
    assert(entry && typeof entry === 'object', `${label}[${index}]: expected object`)
    assertOnlyKeys(
      entry,
      new Set(['at', 'from', 'to', 'reason', 'revisitCondition', 'authority', 'evidence']),
      `${label}[${index}]`,
    )
    safeDate(entry.at, `${label}[${index}].at`)
    if (entry.from !== null) assert(PROPOSAL_STATUSES.has(entry.from), `${label}[${index}].from: invalid status`)
    assert(PROPOSAL_STATUSES.has(entry.to), `${label}[${index}].to: invalid status`)
    safeText(entry.reason, `${label}[${index}].reason`)
    if (entry.revisitCondition !== null && entry.revisitCondition !== undefined)
      safeText(entry.revisitCondition, `${label}[${index}].revisitCondition`)
    if (entry.authority !== null && entry.authority !== undefined)
      safeText(entry.authority, `${label}[${index}].authority`)
    if (entry.evidence !== null && entry.evidence !== undefined) safeText(entry.evidence, `${label}[${index}].evidence`)
  })
}

function proposalHistoryAllows(from, to) {
  if (from === null) return to === 'proposed'
  return {
    proposed: ['deferred', 'accepted', 'rejected', 'superseded'],
    deferred: ['proposed', 'accepted', 'rejected', 'superseded'],
    accepted: ['implementing', 'rejected', 'superseded'],
    implementing: ['evaluating', 'rejected', 'superseded'],
    evaluating: ['verified', 'rejected', 'superseded'],
    verified: [],
    rejected: ['proposed', 'superseded'],
    superseded: [],
  }[from]?.includes(to)
}

function validateProposalHistory(history, status, label) {
  assert(history.length > 0, `${label}: history cannot be empty`)
  let previous = null
  let previousAt = null
  for (const [index, entry] of history.entries()) {
    assert(entry.from === previous, `${label}[${index}]: transition does not continue the prior state`)
    assert(proposalHistoryAllows(entry.from, entry.to), `${label}[${index}]: illegal transition`)
    if (previousAt !== null)
      assert(Date.parse(entry.at) >= Date.parse(previousAt), `${label}[${index}]: history time moved backward`)
    if (entry.to === 'accepted') {
      assert(
        /^host-conversation:[^:]+:[^:]+$/.test(entry.authority ?? ''),
        `${label}[${index}]: accepted transition requires host-conversation authority`,
      )
    }
    if (entry.to === 'deferred') safeText(entry.revisitCondition, `${label}[${index}].revisitCondition`)
    if (entry.to === 'verified') safeText(entry.evidence, `${label}[${index}].evidence`)
    previous = entry.to
    previousAt = entry.at
  }
  assert(previous === status, `${label}: final history state does not match proposal status`)
}

export function validateProposal(record, label = 'proposal') {
  assertOnlyKeys(
    record,
    new Set([
      'schemaVersion',
      'recordType',
      'id',
      'title',
      'status',
      'problem',
      'supportingRecords',
      'suggestedChange',
      'expectedBenefit',
      'effort',
      'risks',
      'acceptanceMeasurements',
      'taskClasses',
      'paths',
      'history',
      'supportingEvidence',
      'lastResurfacedAt',
      'reminderFingerprint',
      'lastEvidenceAt',
    ]),
    label,
  )
  assert(record.schemaVersion === LEARNING_SCHEMA_VERSION, `${label}: unsupported schemaVersion`)
  assert(record.recordType === 'improvement-proposal', `${label}: invalid recordType`)
  assert(/^proposal-[a-f0-9]{16}$/.test(record.id), `${label}: invalid id`)
  for (const field of ['title', 'problem', 'suggestedChange', 'expectedBenefit', 'effort'])
    safeText(record[field], `${label}: ${field}`)
  assert(PROPOSAL_STATUSES.has(record.status), `${label}: invalid status`)
  for (const field of ['supportingRecords', 'risks', 'acceptanceMeasurements', 'taskClasses'])
    safeArray(record[field], `${label}: ${field}`)
  assert(record.supportingRecords.length > 0, `${label}: supportingRecords cannot be empty`)
  assert(
    record.supportingRecords.every(item => /^(?:obs|lesson|proposal)-[a-f0-9]{16}$/.test(item)),
    `${label}: invalid supporting record reference`,
  )
  validateEvidenceSnapshots(record.supportingEvidence, `${label}: supportingEvidence`)
  assert(
    sameReferences(
      record.supportingEvidence.map(item => item.id),
      record.supportingRecords,
    ),
    `${label}: supporting record references do not match embedded evidence`,
  )
  safePaths(record.paths, `${label}: paths`)
  validateHistory(record.history, `${label}: history`)
  validateProposalHistory(record.history, record.status, `${label}: history`)
  validateOptionalDate(record.lastResurfacedAt, `${label}: lastResurfacedAt`)
  validateOptionalDate(record.lastEvidenceAt, `${label}: lastEvidenceAt`)
  if (record.reminderFingerprint !== null && record.reminderFingerprint !== undefined)
    safeText(record.reminderFingerprint, `${label}: reminderFingerprint`, 500)
  return record
}

function validateEvidenceSnapshots(evidence, label) {
  assert(Array.isArray(evidence), `${label}: expected array`)
  evidence.forEach((item, index) => {
    assert(item && typeof item === 'object', `${label}[${index}]: expected object`)
    assertOnlyKeys(
      item,
      new Set([
        'id',
        'recordedAt',
        'observedAt',
        'summary',
        'evidenceSummary',
        'sourceType',
        'sourceRef',
        'guidance',
        'polarity',
        'measurements',
      ]),
      `${label}[${index}]`,
    )
    assert(/^(?:obs|lesson|proposal)-[a-f0-9]{16}$/.test(item.id), `${label}[${index}]: invalid id`)
    safeDate(item.recordedAt, `${label}[${index}].recordedAt`)
    if (item.observedAt !== undefined) safeDate(item.observedAt, `${label}[${index}].observedAt`)
    for (const field of ['summary', 'evidenceSummary', 'sourceType', 'sourceRef']) {
      safeText(item[field], `${label}[${index}].${field}`)
    }
    if (item.guidance !== undefined) safeText(item.guidance, `${label}[${index}].guidance`)
    assert(['supports', 'contradicts', 'neutral'].includes(item.polarity), `${label}[${index}].polarity: invalid value`)
    assert(
      item.measurements && typeof item.measurements === 'object',
      `${label}[${index}].measurements: invalid object`,
    )
    for (const [name, value] of Object.entries(item.measurements)) {
      assert(/^[a-z][a-z0-9-]{0,63}$/.test(name), `${label}[${index}].measurements: invalid name`)
      assert(value === null || (Number.isFinite(value) && value >= 0), `${label}[${index}].measurements: invalid value`)
    }
  })
}

function sameReferences(left, right) {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort())
}

function recordBody(record) {
  if (record.recordType === 'lesson') {
    const evidence = record.evidence.map(item => `- ${item.id}: ${item.summary} (${item.evidenceSummary})`).join('\n')
    return `# ${record.title}\n\nThis advisory lesson applies to task classes: ${record.taskClasses.join(', ') || 'all'}.\n\n## Portable evidence\n\n${evidence || 'No evidence yet.'}\n`
  }
  const evidence = record.supportingEvidence
    .map(item => `- ${item.id}: ${item.summary} (${item.evidenceSummary})`)
    .join('\n')
  return `# ${record.title}\n\nThis is an advisory improvement backlog record. Its status never blocks unrelated task completion.\n\n## Portable supporting evidence\n\n${evidence || 'No evidence yet.'}\n`
}

function writeRecord(directory, record) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o755 })
  const destination = path.join(directory, `${record.id}.md`)
  const content = `---\n${YAML.stringify(record, { lineWidth: 0 }).trimEnd()}\n---\n${recordBody(record)}`
  fs.writeFileSync(destination, content, { encoding: 'utf8', mode: 0o644 })
  return destination
}

export function readLessons(root = process.cwd()) {
  const directory = learningPaths(root).lessons
  if (!fs.existsSync(directory)) return []
  return readRecordDirectory(directory, 'lesson', /^lesson-[a-f0-9]{16}\.md$/)
}

export function readProposals(root = process.cwd()) {
  const directory = learningPaths(root).proposals
  if (!fs.existsSync(directory)) return []
  return readRecordDirectory(directory, 'proposal', /^proposal-[a-f0-9]{16}\.md$/)
}

function readRecordDirectory(directory, recordType, filenamePattern) {
  const files = fs
    .readdirSync(directory)
    .filter(file => file.endsWith('.md') && file !== 'README.md')
    .sort()
  return files.map(file => {
    assert(filenamePattern.test(file), `${path.join(directory, file)}: invalid ${recordType} filename`)
    const record = parseRecord(path.join(directory, file), recordType)
    assert(record.metadata.id === file.slice(0, -3), `${record.filePath}: metadata id does not match filename`)
    return record
  })
}

export function writeLesson(root, record) {
  validateLesson(record)
  return writeRecord(learningPaths(root).lessons, record)
}

export function writeProposal(root, record) {
  validateProposal(record)
  return writeRecord(learningPaths(root).proposals, record)
}

function normalizedTopic(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function confidenceFor(observation) {
  return observation.polarity === 'supports' && observation.sourceType !== 'legacy-run-evolution' ? 'medium' : 'low'
}

export function evidenceSnapshot(observation) {
  return {
    id: observation.observationId,
    recordedAt: observation.recordedAt,
    ...(observation.observedAt ? { observedAt: observation.observedAt } : {}),
    summary: observation.summary,
    evidenceSummary: observation.evidenceSummary,
    sourceType: observation.sourceType,
    sourceRef: observation.sourceRef,
    ...(observation.guidance ? { guidance: observation.guidance } : {}),
    polarity: observation.polarity,
    measurements: structuredClone(observation.measurements),
  }
}

export function lessonFromObservation(observation, harnessVersion) {
  const topic = normalizedTopic(observation.topic)
  return {
    schemaVersion: LEARNING_SCHEMA_VERSION,
    recordType: 'lesson',
    id: stableId('lesson', topic),
    title: observation.topic,
    topic,
    status:
      observation.sourceType === 'legacy-run-evolution' || observation.polarity !== 'supports' ? 'stale' : 'active',
    taskClasses: [observation.taskClass],
    paths: observation.paths,
    harnessVersion,
    confidence: confidenceFor(observation),
    evidenceRefs: observation.polarity === 'contradicts' ? [] : [observation.observationId],
    counterexampleRefs: observation.polarity === 'contradicts' ? [observation.observationId] : [],
    evidence: [evidenceSnapshot(observation)],
    ambiguousObservationRefs: [],
    lastValidatedAt: observation.observedAt ?? observation.recordedAt,
    lastResurfacedAt: null,
    reminderFingerprint: null,
    revalidationEvidenceRef: null,
  }
}

function mergeLesson(record, observation) {
  const lesson = structuredClone(record)
  const referenceField = observation.polarity === 'contradicts' ? 'counterexampleRefs' : 'evidenceRefs'
  lesson[referenceField] = [...new Set([...lesson[referenceField], observation.observationId])]
  lesson.evidence = [...lesson.evidence, evidenceSnapshot(observation)]
  lesson.taskClasses = [...new Set([...lesson.taskClasses, observation.taskClass])].sort()
  lesson.paths = [...new Set([...lesson.paths, ...observation.paths])].sort()
  const containsLegacy = lesson.evidence.some(item => item.sourceType === 'legacy-run-evolution')
  if (observation.polarity === 'supports' && observation.sourceType !== 'legacy-run-evolution') {
    lesson.lastValidatedAt = observation.observedAt ?? observation.recordedAt
  }
  const revalidation = lesson.revalidationEvidenceRef
    ? lesson.evidence.find(item => item.id === lesson.revalidationEvidenceRef)
    : null
  const latestCounterexample = lesson.evidence
    .filter(item => lesson.counterexampleRefs.includes(item.id))
    .map(evidenceTime)
    .sort()
    .at(-1)
  const unresolvedCounterexample =
    latestCounterexample && (!revalidation || Date.parse(evidenceTime(revalidation)) < Date.parse(latestCounterexample))
  if (lesson.counterexampleRefs.length || (containsLegacy && !lesson.revalidationEvidenceRef)) lesson.confidence = 'low'
  else {
    const supported = lesson.evidence.filter(item => item.polarity === 'supports').length
    lesson.confidence = supported >= 2 ? 'high' : supported === 1 ? 'medium' : 'low'
  }
  if (unresolvedCounterexample || (containsLegacy && !lesson.revalidationEvidenceRef) || lesson.status === 'stale')
    lesson.status = 'stale'
  return lesson
}

export function consolidateObservations(
  root,
  observations,
  harnessVersion,
  { sourceObservedAtByRef = new Map() } = {},
) {
  const lessons = readLessons(root)
  const proposals = readProposals(root)
  const result = { created: [], updated: [], skipped: [], ambiguous: [], proposalUpdated: [] }
  result.repaired = reconcileLegacyLessons(root, lessons, sourceObservedAtByRef)
  for (const observation of observations) {
    validateLearningObservation(observation)
    consolidateProposalEvidence(root, proposals, observation, result)
    const candidates = lessons.filter(({ metadata }) => metadata.topic === normalizedTopic(observation.topic))
    if (candidates.length > 1) {
      for (const candidate of candidates) {
        if (candidate.metadata.ambiguousObservationRefs.includes(observation.observationId)) continue
        candidate.metadata.ambiguousObservationRefs.push(observation.observationId)
        candidate.metadata.evidence.push(evidenceSnapshot(observation))
        writeLesson(root, candidate.metadata)
      }
      result.ambiguous.push({
        observationId: observation.observationId,
        lessonIds: candidates.map(item => item.metadata.id),
      })
      continue
    }
    const existing = candidates[0]
    if (!existing) {
      const lesson = lessonFromObservation(observation, harnessVersion)
      writeLesson(root, lesson)
      lessons.push({ metadata: lesson })
      result.created.push(lesson.id)
      continue
    }
    if (
      [...existing.metadata.evidenceRefs, ...existing.metadata.counterexampleRefs].includes(observation.observationId)
    ) {
      result.skipped.push(observation.observationId)
      continue
    }
    const merged = mergeLesson(existing.metadata, observation)
    writeLesson(root, merged)
    existing.metadata = merged
    result.updated.push(merged.id)
  }
  return result
}

function reconcileLegacyLessons(root, lessons, sourceObservedAtByRef) {
  const repaired = []
  for (const { metadata } of lessons) {
    const legacyEvidence = metadata.evidence.filter(item => item.sourceType === 'legacy-run-evolution')
    if (!legacyEvidence.length) continue
    let changed = metadata.status !== 'stale' || metadata.confidence !== 'low'
    metadata.status = 'stale'
    metadata.confidence = 'low'
    const sourceTimes = legacyEvidence.map(item => sourceObservedAtByRef.get(item.sourceRef)).filter(Boolean)
    if (sourceTimes.length) {
      const sourceTime = sourceTimes.sort().at(-1)
      for (const item of legacyEvidence) {
        if (!item.observedAt && sourceObservedAtByRef.has(item.sourceRef)) {
          item.observedAt = sourceObservedAtByRef.get(item.sourceRef)
          changed = true
        }
      }
      if (metadata.lastValidatedAt !== sourceTime) {
        metadata.lastValidatedAt = sourceTime
        changed = true
      }
    }
    if (changed) {
      writeLesson(root, metadata)
      repaired.push(metadata.id)
    }
  }
  return repaired
}

function proposalReferenceFromObservation(observation) {
  if (observation.proposalId) return observation.proposalId
  const match = observation.sourceRef.match(/^proposal:(proposal-[a-f0-9]{16})$/)
  return match?.[1] ?? null
}

function consolidateProposalEvidence(root, proposals, observation, result) {
  const proposalId = proposalReferenceFromObservation(observation)
  if (!proposalId) return
  const proposal = proposals.find(item => item.metadata.id === proposalId)
  if (!proposal) return
  if (proposal.metadata.supportingRecords.includes(observation.observationId)) return
  proposal.metadata.supportingRecords = [...proposal.metadata.supportingRecords, observation.observationId]
  proposal.metadata.supportingEvidence = [...proposal.metadata.supportingEvidence, evidenceSnapshot(observation)]
  proposal.metadata.lastEvidenceAt = observation.recordedAt
  writeProposal(root, proposal.metadata)
  result.proposalUpdated.push(proposalId)
}

export function recordSnapshot(record) {
  if (record.recordType === 'lesson') {
    return {
      id: record.id,
      recordedAt: record.lastValidatedAt,
      summary: record.title,
      evidenceSummary: `Portable lesson with ${record.evidence.length} evidence item(s).`,
      sourceType: 'repository-lesson',
      sourceRef: record.id,
      polarity: 'neutral',
      measurements: {},
    }
  }
  return {
    id: record.id,
    recordedAt: record.lastEvidenceAt,
    summary: record.title,
    evidenceSummary: `Portable proposal in ${record.status} state.`,
    sourceType: 'repository-proposal',
    sourceRef: record.id,
    polarity: 'neutral',
    measurements: {},
  }
}

export function validateLearningReferenceIntegrity(root, observations = [], sourceObservedAtByRef = new Map()) {
  const lessons = readLessons(root).map(item => item.metadata)
  const proposals = readProposals(root).map(item => item.metadata)
  const known = new Map(observations.map(item => [item.observationId, evidenceSnapshot(item)]))
  for (const record of [...lessons, ...proposals]) known.set(record.id, recordSnapshot(record))
  for (const lesson of lessons)
    validateEmbeddedReferences(lesson.evidence, known, `lesson ${lesson.id}`, sourceObservedAtByRef)
  for (const proposal of proposals)
    validateEmbeddedReferences(proposal.supportingEvidence, known, `proposal ${proposal.id}`, sourceObservedAtByRef)
  return { lessonCount: lessons.length, proposalCount: proposals.length, observationCount: observations.length }
}

function validateEmbeddedReferences(evidence, known, label, sourceObservedAtByRef) {
  for (const snapshot of evidence) {
    const local = known.get(snapshot.id)
    if (snapshot.id.startsWith('obs-')) {
      if (!local) continue
      if (snapshot.observedAt && !local.observedAt && sourceObservedAtByRef.has(local.sourceRef)) {
        local.observedAt = sourceObservedAtByRef.get(local.sourceRef)
      }
      assert(
        JSON.stringify(snapshot) === JSON.stringify(local),
        `${label}: embedded evidence for ${snapshot.id} does not match the resolved observation`,
      )
    } else {
      assert(local, `${label}: referenced repository record ${snapshot.id} is not resolved`)
    }
  }
}

const transitions = {
  proposed: new Set(['deferred', 'accepted', 'rejected', 'superseded']),
  deferred: new Set(['proposed', 'accepted', 'rejected', 'superseded']),
  accepted: new Set(['implementing', 'rejected', 'superseded']),
  implementing: new Set(['evaluating', 'rejected', 'superseded']),
  evaluating: new Set(['verified', 'rejected', 'superseded']),
  verified: new Set(),
  rejected: new Set(['proposed', 'superseded']),
  superseded: new Set(),
}

export function createProposal(input, now = new Date().toISOString()) {
  const title = safeText(input.title, 'proposal title', 240)
  const record = {
    schemaVersion: LEARNING_SCHEMA_VERSION,
    recordType: 'improvement-proposal',
    id: stableId('proposal', `${title}|${input.problem}`),
    title,
    status: 'proposed',
    problem: safeText(input.problem, 'proposal problem'),
    supportingRecords: safeArray(input.supportingRecords ?? [], 'proposal supportingRecords'),
    suggestedChange: safeText(input.suggestedChange, 'proposal suggestedChange'),
    expectedBenefit: safeText(input.expectedBenefit, 'proposal expectedBenefit'),
    effort: safeText(input.effort, 'proposal effort', 100),
    risks: safeArray(input.risks ?? [], 'proposal risks'),
    acceptanceMeasurements: safeArray(input.acceptanceMeasurements ?? [], 'proposal acceptanceMeasurements'),
    taskClasses: safeArray(input.taskClasses ?? [], 'proposal taskClasses'),
    paths: safePaths(input.paths ?? [], 'proposal paths'),
    supportingEvidence: structuredClone(input.supportingEvidence ?? []),
    lastResurfacedAt: null,
    reminderFingerprint: null,
    lastEvidenceAt: now,
    history: [
      {
        at: now,
        from: null,
        to: 'proposed',
        reason: 'Recorded as advisory backlog.',
        revisitCondition: null,
        authority: null,
        evidence: null,
      },
    ],
  }
  return validateProposal(record)
}

export function transitionProposal(proposal, input, now = new Date().toISOString()) {
  validateProposal(proposal)
  assert(PROPOSAL_STATUSES.has(input.status), 'proposal transition: invalid status')
  assert(
    transitions[proposal.status].has(input.status),
    `proposal transition: cannot move from ${proposal.status} to ${input.status}`,
  )
  const reason = safeText(input.reason, 'proposal transition reason')
  if (input.status === 'deferred')
    assert(nonBlank(input.revisitCondition), 'proposal transition: deferred status requires revisit condition')
  if (input.status === 'accepted') {
    assert(
      input.authoritySource === 'host-conversation',
      'proposal transition: acceptance requires host-conversation authority',
    )
    safeText(input.threadId, 'proposal transition threadId', 200)
    safeText(input.messageId, 'proposal transition messageId', 200)
  }
  if (input.status === 'verified') safeText(input.evaluationEvidence, 'proposal evaluation evidence')
  const authority = input.status === 'accepted' ? `host-conversation:${input.threadId}:${input.messageId}` : null
  const next = structuredClone(proposal)
  next.history.push({
    at: now,
    from: proposal.status,
    to: input.status,
    reason,
    revisitCondition: input.revisitCondition ?? null,
    authority,
    evidence: input.status === 'verified' ? input.evaluationEvidence : null,
  })
  next.status = input.status
  return validateProposal(next)
}

function daysSince(date, now) {
  return (Date.parse(now) - Date.parse(date)) / 86_400_000
}

export function markStaleLessons(root, now = new Date().toISOString()) {
  const stale = []
  for (const { metadata } of readLessons(root)) {
    if (metadata.status === 'active' && daysSince(metadata.lastValidatedAt, now) > STALE_AFTER_DAYS) {
      metadata.status = 'stale'
      writeLesson(root, metadata)
      stale.push(metadata.id)
    }
  }
  return stale
}

function relevance(lesson, query) {
  const taskMatch = Boolean(query.taskClass) && lesson.taskClasses.includes(query.taskClass)
  const pathMatch =
    Boolean(query.paths.length) &&
    lesson.paths.some(pathItem => query.paths.some(item => item.startsWith(pathItem) || pathItem.startsWith(item)))
  const contextualQuery = Boolean(query.taskClass || query.paths.length)
  if (contextualQuery && !taskMatch && !pathMatch) return 0
  const versionMatch = !query.harnessVersion || lesson.harnessVersion === query.harnessVersion
  return (contextualQuery ? 0 : 1) + Number(taskMatch) * 2 + Number(pathMatch) * 2 + Number(versionMatch)
}

function rejectedAt(proposal) {
  return [...proposal.history].reverse().find(item => item.to === 'rejected')?.at ?? null
}

export function retrieveLessons(root, input, now = new Date().toISOString()) {
  const limit = input.limit ?? 3
  assert(Number.isInteger(limit) && limit >= 1 && limit <= 10, 'lesson retrieval: limit must be between 1 and 10')
  const query = {
    taskClass: input.taskClass ?? null,
    paths: input.paths ?? [],
    harnessVersion: input.harnessVersion ?? null,
  }
  safePaths(query.paths, 'lesson retrieval paths')
  const fingerprintFor = references =>
    `${query.taskClass ?? ''}|${[...query.paths].sort().join(',')}|${query.harnessVersion ?? ''}|${[...references].sort().join(',')}`
  const allProposals = readProposals(root)
  const hasReconsideration = allProposals.some(({ metadata }) => {
    const rejected = rejectedAt(metadata)
    return (
      relevance(metadata, query) > 0 &&
      metadata.status === 'rejected' &&
      rejected &&
      Date.parse(metadata.lastEvidenceAt) > Date.parse(rejected)
    )
  })
  const lessonLimit = Math.max(0, limit - Number(hasReconsideration))
  const selected = []
  const suppressed = []
  for (const { metadata } of readLessons(root).sort(
    (left, right) => relevance(right.metadata, query) - relevance(left.metadata, query),
  )) {
    if (selected.length >= lessonLimit) break
    if (relevance(metadata, query) === 0) continue
    const fingerprint = fingerprintFor([
      ...metadata.evidenceRefs,
      ...metadata.counterexampleRefs,
      ...metadata.ambiguousObservationRefs,
    ])
    const unchanged =
      metadata.reminderFingerprint === fingerprint &&
      metadata.lastResurfacedAt &&
      daysSince(metadata.lastResurfacedAt, now) < REMINDER_SUPPRESSION_DAYS
    if (unchanged) {
      suppressed.push(metadata.id)
      continue
    }
    metadata.lastResurfacedAt = now
    metadata.reminderFingerprint = fingerprint
    writeLesson(root, metadata)
    selected.push(metadata)
    if (selected.length === lessonLimit) break
  }
  const proposals = []
  const suppressedProposals = []
  for (const { metadata } of allProposals.sort(
    (left, right) => relevance(right.metadata, query) - relevance(left.metadata, query),
  )) {
    if (relevance(metadata, query) === 0 || proposals.length + selected.length >= limit) continue
    if (metadata.status === 'verified' || metadata.status === 'superseded') continue
    const rejected = rejectedAt(metadata)
    if (metadata.status === 'rejected' && (!rejected || Date.parse(metadata.lastEvidenceAt) <= Date.parse(rejected))) {
      suppressedProposals.push(metadata.id)
      continue
    }
    const fingerprint = fingerprintFor(metadata.supportingRecords)
    const unchanged =
      metadata.reminderFingerprint === fingerprint &&
      metadata.lastResurfacedAt &&
      daysSince(metadata.lastResurfacedAt, now) < REMINDER_SUPPRESSION_DAYS
    if (unchanged) {
      suppressedProposals.push(metadata.id)
      continue
    }
    metadata.lastResurfacedAt = now
    metadata.reminderFingerprint = fingerprint
    writeProposal(root, metadata)
    proposals.push({ ...metadata, reconsideration: metadata.status === 'rejected' })
  }
  return { lessons: selected, suppressed, proposals, suppressedProposals, limit }
}

export function revalidateLesson(root, id, observation) {
  const lesson = readLessons(root).find(item => item.metadata.id === id)
  assert(lesson, `Unknown lesson: ${id}`)
  validateLearningObservation(observation, 'lesson revalidation observation')
  assert(observation.polarity === 'supports', 'lesson revalidation observation must support the lesson')
  assert(observation.sourceType !== 'legacy-run-evolution', 'lesson revalidation observation must be nonlegacy')
  lesson.metadata.evidenceRefs = [...new Set([...lesson.metadata.evidenceRefs, observation.observationId])]
  if (!lesson.metadata.evidence.some(item => item.id === observation.observationId)) {
    lesson.metadata.evidence.push(evidenceSnapshot(observation))
  }
  lesson.metadata.status = 'active'
  lesson.metadata.lastValidatedAt = observation.observedAt ?? observation.recordedAt
  lesson.metadata.revalidationEvidenceRef = observation.observationId
  lesson.metadata.reminderFingerprint = null
  lesson.metadata.lastResurfacedAt = null
  writeLesson(root, lesson.metadata)
  return lesson.metadata
}
