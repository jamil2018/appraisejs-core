import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  PROFILE_IDS,
  TASK_CLASSES,
  normalizeTaskClass,
  validateRoutingDecision,
} from '../lib/swarm-routing-contract.mjs'
import { createRoutingDecision, recommendSwarmRoute } from '../lib/swarm-router.mjs'

const scriptsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const fixtures = JSON.parse(fs.readFileSync(path.join(scriptsDir, 'fixtures', 'swarm-routing-contracts.json'), 'utf8'))

function validDecision(overrides = {}) {
  return {
    decisionId: 'decision-1',
    recordedAt: '2026-07-24T00:00:00.000Z',
    taskClass: 'localized-fix',
    route: 'coordinator-only',
    signals: {
      missingEvidence: false,
      contradictoryEvidence: false,
      evidenceLedger: false,
      highJudgment: false,
      crossModule: false,
      securityRisk: false,
      persistenceRisk: false,
      migrationRisk: false,
      publicContractRisk: false,
      invariantInvalidated: false,
      duplicateDelegation: false,
      executorFailures: 0,
    },
    verificationStrength: 'strong',
    consequence: 'low',
    profile: 'coordinator-only',
    delegationCount: 0,
    rationale: 'Bounded task.',
    material: false,
    requiresIndependentJudge: false,
    runtimeProof: unverifiedRuntimeProof(),
    classificationLatencyMs: 1,
    escalationCount: 0,
    retryCount: 0,
    rerouteCount: 0,
    ...overrides,
  }
}

test('routing contract accepts each supported route', () => {
  const decisions = [
    validDecision(),
    validDecision({ route: 'investigator', profile: 'investigator', delegationCount: 1 }),
    validDecision({
      route: 'solver',
      profile: 'solver',
      delegationCount: 1,
      signals: { ...validDecision().signals, evidenceLedger: true, highJudgment: true },
    }),
    validDecision({ route: 'executor', profile: 'executor', delegationCount: 1 }),
    validDecision({ route: 'judge', profile: 'judge', delegationCount: 1 }),
  ]
  for (const decision of decisions) assert.equal(validateRoutingDecision(decision), decision)
  assert.deepEqual(PROFILE_IDS, [
    'coordinator-only',
    'investigator',
    'executor',
    'executor-advanced',
    'solver',
    'judge',
  ])
})

test('routing contract rejects contradictions and false host proof', () => {
  assert.throws(
    () => validateRoutingDecision(validDecision({ route: 'investigator', profile: 'executor', delegationCount: 1 })),
    /contradict/,
  )
  assert.throws(
    () =>
      validateRoutingDecision(
        validDecision({
          signals: { ...validDecision().signals, migrationRisk: true },
          requiresIndependentJudge: false,
        }),
      ),
    /requires an independent judge/,
  )
  assert.throws(() => validateRoutingDecision(validDecision({ profile: 'unknown' })), /unknown profile/)
  assert.throws(() => validateRoutingDecision(validDecision({ rationale: ' ' })), /non-blank/)
  assert.throws(
    () =>
      validateRoutingDecision(
        validDecision({ runtimeProof: { ...unverifiedRuntimeProof(), status: 'verified', receipt: '' } }),
      ),
    /blankless/,
  )
  assert.throws(
    () =>
      validateRoutingDecision(
        validDecision({
          runtimeProof: {
            ...unverifiedRuntimeProof(),
            claims: {
              ...unverifiedRuntimeProof().claims,
              model: { status: 'verified', receipt: null },
            },
          },
        }),
      ),
    /model: verified status requires a matching host-effective receipt/,
  )
  assert.throws(() => validateRoutingDecision(validDecision({ taskClass: 'unbounded-new-class' })), /unsupported value/)
  assert.throws(
    () => validateRoutingDecision(validDecision({ route: 'coordinator-only', delegationCount: 1 })),
    /cannot delegate/,
  )
})

test('fixtures exercise deterministic route selection and escalation', () => {
  for (const fixture of fixtures) {
    const route = recommendSwarmRoute(fixture.input)
    assert.ok(fixture.allowedRoutes.includes(route.route), `${fixture.name}: route must be allowed`)
    assert.ok(!fixture.prohibitedRoutes.includes(route.route), `${fixture.name}: route must not be prohibited`)
    for (const [field, expected] of Object.entries(fixture.expected)) {
      assert.equal(route[field], expected, fixture.name)
    }
  }
})

test('fixture task classes map into the stable scorecard taxonomy', () => {
  const expectedClasses = {
    'mechanical-refactor': 'localized-fix',
    'runtime-debugging': 'localized-fix',
    'architecture-decision': 'architecture-review',
    'public-contract-change': 'cross-module-feature',
    'security-change': 'cross-module-feature',
  }
  for (const fixture of fixtures) {
    const decision = createRoutingDecision({
      ...fixture.input,
      decisionId: `fixture-${fixture.name}`,
      recordedAt: '2026-07-24T00:00:00.000Z',
    })
    assert.ok(TASK_CLASSES.includes(decision.taskClass), fixture.name)
    assert.equal(decision.taskClass, expectedClasses[fixture.input.taskClass] ?? fixture.input.taskClass, fixture.name)
    assert.equal(normalizeTaskClass(fixture.input.taskClass), decision.taskClass, fixture.name)
  }
})

test('no mechanical work routes directly to Sol without an evidence-gated judgment signal', () => {
  for (const input of [
    { taskClass: 'mechanical-refactor', requiresExecution: true },
    { taskClass: 'long-formatting', requiresExecution: true, crossModule: true, verificationStrength: 'strong' },
    { taskClass: 'routine-task', material: false },
  ]) {
    const result = recommendSwarmRoute(input)
    assert.notEqual(result.profile, 'solver')
    assert.notEqual(result.profile, 'judge')
  }
  assert.equal(recommendSwarmRoute({ highJudgment: true, evidenceLedger: false }).profile, 'investigator')
})

test('material risk is evidence-gated and cannot fall through to coordinator-only', () => {
  for (const risk of ['securityRisk', 'persistenceRisk', 'migrationRisk', 'publicContractRisk']) {
    assert.equal(recommendSwarmRoute({ [risk]: true }).route, 'investigator')
    const withEvidence = recommendSwarmRoute({ [risk]: true, evidenceLedger: true })
    assert.equal(withEvidence.route, 'solver')
    assert.equal(withEvidence.requiresIndependentJudge, true)
  }
})

test('created decisions conform to the contract and never fabricate runtime proof', () => {
  const decision = createRoutingDecision({
    taskClass: 'cross-module-feature',
    requiresExecution: true,
    crossModule: true,
  })
  assert.equal(decision.profile, 'executor-advanced')
  assert.equal(decision.requiresIndependentJudge, false)
  assert.deepEqual(decision.runtimeProof, unverifiedRuntimeProof())
})

test('verified runtime proof requires matching property-specific effective host receipts', () => {
  const proof = unverifiedRuntimeProof()
  proof.claims = {
    ...proof.claims,
    role: { status: 'verified', receipt: 'host-effective-role:investigator' },
    model: { status: 'verified', receipt: 'host-effective-model:gpt-5.6-luna' },
    reasoning: { status: 'verified', receipt: 'host-effective-reasoning:medium' },
    context: { status: 'verified', receipt: 'host-effective-context:fork_turns:none' },
    sandbox: { status: 'verified', receipt: 'host-effective-sandbox:read-only' },
  }
  proof.status = 'verified'
  assert.equal(
    validateRoutingDecision(
      validDecision({ route: 'investigator', profile: 'investigator', delegationCount: 1, runtimeProof: proof }),
    ).route,
    'investigator',
  )
  assert.throws(
    () =>
      validateRoutingDecision(
        validDecision({
          runtimeProof: {
            ...unverifiedRuntimeProof(),
            status: 'partial',
            claims: {
              ...unverifiedRuntimeProof().claims,
              context: { status: 'verified', receipt: 'requested-selector:fork_turns:none' },
            },
          },
        }),
      ),
    /context: verified status requires a matching host-effective receipt/,
  )
})

function unverifiedRuntimeProof() {
  return {
    status: 'unverified',
    receipt: null,
    claims: Object.fromEntries(
      ['role', 'model', 'reasoning', 'context', 'sandbox'].map(property => [
        property,
        { status: 'unverified', receipt: null },
      ]),
    ),
  }
}
