import {
  canonicalRuntimeCapsuleJson,
  hashRuntimeCapsuleValue,
  parseCanonicalRuntimeCapsuleManifest,
  type RuntimeCapsuleManifest,
} from '@/lib/runtime-capsule/contracts'
import { TagType, TestRunTestCaseStatus } from '@prisma/client'
import { canonicalTagExpression, getIdentifierTagByPrefix } from '@/lib/tag-filters'

type TagLike = {
  name: string
  tagExpression: string
  type: TagType
}

type MatchableRunTestCase = {
  id: string
  status: TestRunTestCaseStatus
  testSuiteId: string | null
  testCase: {
    id: string
    title: string
    tags: TagLike[]
  }
  testSuite?: {
    id: string
    name: string
    tags: TagLike[]
  } | null
}

type ScenarioMatchInput = {
  scenarioName: string
  scenarioTags?: string[]
}

function normalizeTagExpression(tagExpression: string): string {
  return canonicalTagExpression(tagExpression)
}

function matchesIdentifier(tags: TagLike[], prefix: 'tc_' | 'ts_', expected: string): boolean {
  const identifier = getIdentifierTagByPrefix(tags, prefix)
  return Boolean(
    identifier &&
    normalizeTagExpression(identifier.tagExpression || identifier.name) === normalizeTagExpression(expected),
  )
}

function consumeCandidate<T extends MatchableRunTestCase>(candidates: T[]): T | undefined {
  const unconsumed = candidates.find(
    candidate =>
      candidate.status !== TestRunTestCaseStatus.COMPLETED && candidate.status !== TestRunTestCaseStatus.CANCELLED,
  )

  return unconsumed ?? candidates[0]
}

function extractTestCaseTitleFromScenarioName(scenarioName: string): string | null {
  const bracketMatch = scenarioName.match(/^\[([^\]]+)\]/)
  if (bracketMatch) {
    return bracketMatch[1].trim()
  }

  const trimmedName = scenarioName.trim()
  return trimmedName.length > 0 ? trimmedName : null
}

export function findMatchingTestRunTestCase<T extends MatchableRunTestCase>(
  testRunTestCases: T[],
  { scenarioName, scenarioTags = [] }: ScenarioMatchInput,
): T | undefined {
  const suiteIdentifierTag = scenarioTags.find(tag => normalizeTagExpression(tag).startsWith('@ts_'))
  const testCaseIdentifierTag = scenarioTags.find(tag => normalizeTagExpression(tag).startsWith('@tc_'))
  const testCaseTitle = extractTestCaseTitleFromScenarioName(scenarioName)

  const bySuite = suiteIdentifierTag
    ? testRunTestCases.filter(
        testRunTestCase =>
          testRunTestCase.testSuite && matchesIdentifier(testRunTestCase.testSuite.tags, 'ts_', suiteIdentifierTag),
      )
    : []

  if (bySuite.length > 0) {
    if (testCaseIdentifierTag) {
      const bySuiteAndTestCaseIdentifier = bySuite.filter(testRunTestCase =>
        matchesIdentifier(testRunTestCase.testCase.tags, 'tc_', testCaseIdentifierTag),
      )

      const matchedBySuiteAndTestCaseIdentifier = consumeCandidate(bySuiteAndTestCaseIdentifier)
      if (matchedBySuiteAndTestCaseIdentifier) {
        return matchedBySuiteAndTestCaseIdentifier
      }
    }

    if (testCaseTitle) {
      const bySuiteAndTitle = bySuite.filter(testRunTestCase => testRunTestCase.testCase.title === testCaseTitle)
      const matchedBySuiteAndTitle = consumeCandidate(bySuiteAndTitle)
      if (matchedBySuiteAndTitle) {
        return matchedBySuiteAndTitle
      }
    }

    return consumeCandidate(bySuite)
  }

  if (testCaseIdentifierTag) {
    const byTestCaseIdentifier = testRunTestCases.filter(testRunTestCase =>
      matchesIdentifier(testRunTestCase.testCase.tags, 'tc_', testCaseIdentifierTag),
    )

    const matchedByTestCaseIdentifier = consumeCandidate(byTestCaseIdentifier)
    if (matchedByTestCaseIdentifier) {
      return matchedByTestCaseIdentifier
    }
  }

  if (testCaseTitle) {
    const byTitle = testRunTestCases.filter(testRunTestCase => testRunTestCase.testCase.title === testCaseTitle)
    const matchedByTitle = consumeCandidate(byTitle)
    if (matchedByTitle) {
      return matchedByTitle
    }
  }

  return undefined
}

type FrozenSelectionRefusalReason =
  | 'FROZEN_SELECTION_MISSING'
  | 'FROZEN_SELECTION_CORRUPT'
  | 'FROZEN_RUN_BINDING_MISMATCH'
  | 'FROZEN_CASE_LINK_MISMATCH'
  | 'FROZEN_SCENARIO_UNMATCHED'
  | 'FROZEN_SCENARIO_AMBIGUOUS'
  | 'FROZEN_SCENARIO_DUPLICATE'

type FrozenRefusal = {
  ok: false
  protocol: 'M06_FROZEN_RUN_SELECTION_V1'
  reason: FrozenSelectionRefusalReason
}
type FrozenCaseLink = { id: string; testRunId: string; testCaseId: string; testSuiteId: string | null }
export type FrozenJourneyRun = {
  id: string
  runId: string
  intent: string
  targetProjectId: string | null
  environmentId: string
  browserEngine: string
  environmentSnapshotJson: string | null
  environmentSnapshotHash: string | null
  environmentSnapshotVersion: number | null
  runtimeCapsule: {
    id: string
    targetProjectId: string
    testRunId: string
    validationHash: string
    manifestHash: string
    manifestJson: string
  } | null
  qualityJourneyExecutionBinding: {
    id: string
    executionCycleId: string
    preparedCapsuleId: string
    testRunId: string
    runId: string
    executionCycle: {
      id: string
      journeyId: string
      targetProjectId: string
      cycleId: string
      targetFingerprint: string
      environmentId: string
      browserEngine: string
      environmentSnapshotJson: string
      environmentSnapshotHash: string
      environmentSnapshotVersion: number
      preparedCapsulesJson: string
      preparedCapsulesHash: string
    }
  } | null
  testCases: FrozenCaseLink[]
}
type FrozenExpectedCase = RuntimeCapsuleManifest['expectedCases'][number] & { link: Readonly<FrozenCaseLink> }
export type FrozenJourneySelection = Readonly<{ expectedCases: readonly Readonly<FrozenExpectedCase>[] }>

function frozenRefusal(reason: FrozenSelectionRefusalReason): FrozenRefusal {
  return { ok: false, protocol: 'M06_FROZEN_RUN_SELECTION_V1', reason }
}

function frozenRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Contradictory retained Journey metadata never enables independent matching. */
export function requiresFrozenJourneyMatching(
  run: Pick<FrozenJourneyRun, 'intent' | 'qualityJourneyExecutionBinding' | 'runtimeCapsule'>,
): boolean {
  if (run.intent !== 'INDEPENDENT' || run.qualityJourneyExecutionBinding) return true
  try {
    const manifest = JSON.parse(run.runtimeCapsule?.manifestJson ?? 'null')
    return frozenRecord(manifest?.source?.snapshot)?.journey !== undefined
  } catch {
    return false
  }
}

/** Retained metadata interpretation only: no live source, tag, session or use reads. */
export function validateFrozenJourneySelection(
  run: FrozenJourneyRun,
): { ok: true; selection: FrozenJourneySelection } | FrozenRefusal {
  const capsule = run.runtimeCapsule
  const binding = run.qualityJourneyExecutionBinding
  if (!capsule || !binding || !binding.executionCycle) return frozenRefusal('FROZEN_SELECTION_MISSING')
  const cycle = binding.executionCycle
  if (
    run.intent !== 'QUALITY_JOURNEY' ||
    binding.testRunId !== run.id ||
    binding.runId !== run.runId ||
    binding.executionCycleId !== cycle.id ||
    run.targetProjectId !== cycle.targetProjectId ||
    capsule.targetProjectId !== run.targetProjectId ||
    capsule.testRunId !== run.id ||
    run.environmentId !== cycle.environmentId ||
    run.browserEngine !== cycle.browserEngine ||
    run.environmentSnapshotJson !== cycle.environmentSnapshotJson ||
    run.environmentSnapshotHash !== cycle.environmentSnapshotHash ||
    run.environmentSnapshotVersion !== cycle.environmentSnapshotVersion
  )
    return frozenRefusal('FROZEN_RUN_BINDING_MISMATCH')
  try {
    const manifest = parseCanonicalRuntimeCapsuleManifest(capsule.manifestJson)
    if (
      hashRuntimeCapsuleValue(manifest) !== capsule.manifestHash ||
      manifest.runId !== run.runId ||
      manifest.projectId !== run.targetProjectId ||
      manifest.validationHash !== capsule.validationHash ||
      manifest.source.kind !== 'AUTHORED_TEST_SNAPSHOT' ||
      manifest.generator.id !== 'appraise.validation-ast-capsule' ||
      manifest.generator.version !== '2'
    )
      return frozenRefusal('FROZEN_SELECTION_CORRUPT')
    const snapshot = frozenRecord(manifest.source.snapshot)
    const journey = frozenRecord(snapshot?.journey)
    if (!snapshot || !journey || !Array.isArray(snapshot.selection)) return frozenRefusal('FROZEN_SELECTION_MISSING')
    const sources: unknown = JSON.parse(cycle.preparedCapsulesJson)
    if (
      !Array.isArray(sources) ||
      canonicalRuntimeCapsuleJson(sources) !== cycle.preparedCapsulesJson ||
      hashRuntimeCapsuleValue(sources) !== cycle.preparedCapsulesHash ||
      sources.length === 0
    )
      return frozenRefusal('FROZEN_SELECTION_CORRUPT')
    const sourceRows = sources.map(frozenRecord)
    if (
      sourceRows.some(
        source =>
          !source ||
          ![
            'preparedCapsuleId',
            'materializationId',
            'testCaseId',
            'suiteId',
            'capsuleHash',
            'manifestHash',
            'manifestJson',
            'scenarioRevisionId',
            'scenarioContentHash',
            'targetBindingId',
            'targetBindingHash',
          ].every(key => typeof source[key] === 'string' && source[key] !== '') ||
          !Array.isArray(source.resourceHashes) ||
          source.resourceHashes.some(value => {
            const resource = frozenRecord(value)
            return !resource || typeof resource.id !== 'string' || typeof resource.contentHash !== 'string'
          }),
      ) ||
      new Set(sourceRows.map(source => source?.preparedCapsuleId)).size !== sources.length ||
      new Set(sourceRows.map(source => source?.materializationId)).size !== sources.length ||
      canonicalRuntimeCapsuleJson(
        [...sources].sort((left, right) =>
          String(frozenRecord(left)?.preparedCapsuleId).localeCompare(String(frozenRecord(right)?.preparedCapsuleId)),
        ),
      ) !== cycle.preparedCapsulesJson
    )
      return frozenRefusal('FROZEN_SELECTION_CORRUPT')
    const selected = sourceRows.filter(source => source?.preparedCapsuleId === binding.preparedCapsuleId)
    const source = selected[0]
    if (
      selected.length !== 1 ||
      !source ||
      journey.journeyId !== cycle.journeyId ||
      journey.executionCycleId !== cycle.id ||
      journey.cycleId !== cycle.cycleId ||
      journey.targetFingerprint !== cycle.targetFingerprint ||
      snapshot.targetProjectId !== run.targetProjectId ||
      snapshot.targetFingerprint !== cycle.targetFingerprint ||
      snapshot.environmentId !== cycle.environmentId ||
      snapshot.browserEngine !== cycle.browserEngine ||
      snapshot.environmentSnapshotHash !== cycle.environmentSnapshotHash ||
      Object.keys(source).some(
        key => canonicalRuntimeCapsuleJson(source[key]) !== canonicalRuntimeCapsuleJson(journey[key]),
      )
    )
      return frozenRefusal('FROZEN_RUN_BINDING_MISMATCH')
    const preparedManifest = JSON.parse(String(source.manifestJson))
    if (
      canonicalRuntimeCapsuleJson(preparedManifest) !== source.manifestJson ||
      hashRuntimeCapsuleValue(preparedManifest) !== source.manifestHash
    )
      return frozenRefusal('FROZEN_SELECTION_CORRUPT')
    const tuples = manifest.expectedCases
    const selection = snapshot.selection.map(item => {
      const entry = frozenRecord(item)
      return { suiteId: frozenRecord(entry?.suite)?.id, caseId: frozenRecord(entry?.testCase)?.id }
    })
    if (
      tuples.length === 0 ||
      tuples.length !== selection.length ||
      new Set(tuples.map(item => item.caseId)).size !== tuples.length ||
      new Set(tuples.map(item => item.scenarioId)).size !== tuples.length ||
      tuples.some(
        item =>
          item.suiteId !== source.suiteId ||
          item.caseId !== source.testCaseId ||
          selection.filter(value => value.suiteId === item.suiteId && value.caseId === item.caseId).length !== 1,
      )
    )
      return frozenRefusal('FROZEN_SELECTION_CORRUPT')
    if (
      run.testCases.length !== tuples.length ||
      new Set(run.testCases.map(link => link.id)).size !== tuples.length ||
      tuples.some(
        item =>
          run.testCases.filter(
            link => link.testRunId === run.id && link.testCaseId === item.caseId && link.testSuiteId === item.suiteId,
          ).length !== 1,
      )
    )
      return frozenRefusal('FROZEN_CASE_LINK_MISMATCH')
    return {
      ok: true,
      selection: Object.freeze({
        expectedCases: Object.freeze(
          tuples.map(item =>
            Object.freeze({
              ...item,
              link: Object.freeze({
                id: run.testCases.find(
                  link =>
                    link.testRunId === run.id && link.testCaseId === item.caseId && link.testSuiteId === item.suiteId,
                )!.id,
                testRunId: run.id,
                testCaseId: item.caseId,
                testSuiteId: item.suiteId,
              }),
            }),
          ),
        ),
      }),
    }
  } catch {
    return frozenRefusal('FROZEN_SELECTION_CORRUPT')
  }
}

export function matchFrozenJourneyScenario(
  selection: FrozenJourneySelection,
  scenarioTags: readonly string[] = [],
): { ok: true; expectedCase: Readonly<FrozenExpectedCase> } | FrozenRefusal {
  const prefixes = ['@appraise_validation_', '@ts_', '@tc_']
  const reserved = prefixes.map(prefix => scenarioTags.filter(tag => tag.startsWith(prefix)))
  if (reserved.some(tags => tags.length > 1)) return frozenRefusal('FROZEN_SCENARIO_AMBIGUOUS')
  if (reserved.some(tags => tags.length !== 1)) return frozenRefusal('FROZEN_SCENARIO_UNMATCHED')
  const matches = selection.expectedCases.filter(
    item =>
      reserved[0]![0] === `@appraise_validation_${item.validationId}` &&
      reserved[1]![0] === `@ts_${item.suiteId}` &&
      reserved[2]![0] === `@tc_${item.caseId}`,
  )
  if (matches.length !== 1)
    return frozenRefusal(matches.length > 1 ? 'FROZEN_SCENARIO_AMBIGUOUS' : 'FROZEN_SCENARIO_UNMATCHED')
  return { ok: true, expectedCase: matches[0]! }
}

export function reconcileFrozenJourneyReport(
  selection: FrozenJourneySelection,
  scenarios: readonly { scenarioTags: readonly string[] }[],
):
  | {
      ok: true
      matches: readonly Readonly<FrozenExpectedCase>[]
      matchedScenarios: number
      unmatchedScenarios: number
      unexecutedExpectedTestCases: number
    }
  | (FrozenRefusal & { matchedScenarios: number; unmatchedScenarios: number; unexecutedExpectedTestCases: number }) {
  const seen = new Set<string>()
  const matches: Readonly<FrozenExpectedCase>[] = []
  let reason: FrozenSelectionRefusalReason | undefined
  let unmatchedScenarios = 0
  for (const scenario of scenarios) {
    const match = matchFrozenJourneyScenario(selection, scenario.scenarioTags)
    if (!match.ok) {
      reason ??= match.reason
      unmatchedScenarios += 1
    } else if (seen.has(match.expectedCase.link.id)) {
      reason ??= 'FROZEN_SCENARIO_DUPLICATE'
      unmatchedScenarios += 1
    } else {
      seen.add(match.expectedCase.link.id)
      matches.push(match.expectedCase)
    }
  }
  const unexecutedExpectedTestCases = selection.expectedCases.length - seen.size
  const counts = { matchedScenarios: seen.size, unmatchedScenarios, unexecutedExpectedTestCases }
  if (reason || unexecutedExpectedTestCases)
    return { ...frozenRefusal(reason ?? 'FROZEN_SCENARIO_UNMATCHED'), ...counts }
  return { ok: true, matches: Object.freeze(matches), ...counts }
}
