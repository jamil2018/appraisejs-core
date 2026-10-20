import assert from 'node:assert/strict'
import test from 'node:test'
import { POLICY, POLICY_DIGEST, casePolicy, digest } from './fixtures/codex-app-server-m02-ta/policy.mjs'

const b07 = POLICY.cases.filter(item => item.id.startsWith('B07-'))

test('the trusted policy is a frozen offline script with no runtime authority', () => {
  assert.equal(POLICY.version, 'M02-TA-P1-T0-v3')
  assert.equal(POLICY.runtimeAuthority, false)
  assert.equal(POLICY.evidenceClass, 'OFFLINE_PREPARED')
  assert.equal(POLICY_DIGEST, digest(POLICY))
  assert.ok(Object.isFrozen(POLICY.cases))
  assert.ok(POLICY.cases.every(item => Object.isFrozen(item.script)))
  assert.equal(POLICY.cases.length, 27)
  assert.deepEqual(POLICY.aggregate, {
    threadStarts: 27,
    turnStarts: 26,
    providerRequests: 63,
    scopedCalls: 34,
    workspaceActions: 2,
    permissionReplies: 1,
    codexStarts: 27,
    mcpStarts: 27,
    listenerStarts: 27,
    controlWrites: 108,
    canonicalRequests: 190,
    helperStarts: 2,
  })
})

test('six positive roles specify their registered logical read and submit operations', () => {
  const expected = [
    ['quality_journey_analysis_get', 'quality_journey_external_analyzer_analysis_submit_v1'],
    ['quality_journey_discovery_get', 'quality_journey_external_scout_target_observation_submit_v1'],
    [
      'quality_journey_discovery_get',
      'operation_search',
      'quality_journey_external_resource_explorer_resolution_submit_v1',
    ],
    ['quality_journey_scenarios_get', 'quality_journey_external_scenarios_submit_v1'],
    ['operation_search', 'quality_journey_external_automator_materialize_v1'],
    ['quality_journey_triage_get', 'quality_journey_triage_evidence_read', 'quality_journey_external_triage_submit_v1'],
  ]
  for (const [index, names] of expected.entries()) {
    const item = casePolicy(`B0${index + 1}`)
    assert.equal(item.script.kind, 'role-read-submit')
    assert.deepEqual(
      item.script.operations.map(step => step.toolName),
      names,
    )
    assert.equal(item.script.acceptance, 'canonical-receipt-and-artifact-identity-required')
  }
})

test('B07 selectors and rejection layers are exact and role-scoped', () => {
  assert.equal(b07.length, 16)
  const fields = [
    'target',
    'targetProjectId',
    'journeyId',
    'assignmentGeneration',
    'coordinatorGeneration',
    'assignmentSecret',
    'leaseId',
    'principal',
  ]
  const absent = [
    'quality_journey_analysis_answer',
    'quality_journey_analysis_decide',
    'quality_journey_command_submit',
    'quality_journey_execution_start',
    'quality_journey_external_work_claim_v1',
    'quality_journey_get',
  ]
  for (const [index, field] of fields.entries()) {
    const item = casePolicy(`B07-A${String(index + 1).padStart(2, '0')}`)
    assert.equal(item.role, 'REQUIREMENT_ANALYZER')
    assert.deepEqual(item.script.mutation, { location: 'top-level', field, value: 'forged' })
    assert.deepEqual(
      item.script.operations.map(step => step.toolName),
      ['quality_journey_external_analyzer_analysis_submit_v1'],
    )
    assert.equal(item.script.expectedOfflineFirstLayer, 'strict-argument-schema')
    assert.equal(item.script.nativeFirstLayer, 'UNQUALIFIED')
  }
  for (const [index, name] of absent.entries()) {
    const item = casePolicy(`B07-A${String(index + 9).padStart(2, '0')}`)
    assert.equal(item.role, 'REQUIREMENT_ANALYZER')
    assert.deepEqual(item.script.operations, [{ toolName: name, argumentsRef: 'empty' }])
    assert.equal(item.script.expectedOfflineFirstLayer, 'unregistered-role-tool-lookup')
    assert.equal(item.script.expectedOfflineCode, -32601)
    assert.equal(item.script.nativeFirstLayer, 'UNQUALIFIED')
  }
  const designer = casePolicy('B07-D01')
  assert.equal(designer.role, 'TEST_SCENARIO_DESIGNER')
  assert.deepEqual(designer.script.mutation, { location: 'result', field: 'role', value: 'AUTOMATOR' })
  assert.equal(designer.script.expectedOfflineFirstLayer, 'worker-result-binding-validator')
  const triager = casePolicy('B07-T01')
  assert.equal(triager.role, 'TRIAGER')
  assert.deepEqual(triager.script.arguments, { receiptId: 'foreign', artifactKind: 'log', offset: 0, limit: 4096 })
  assert.equal(triager.script.expectedOfflineFirstLayer, 'frozen-read-key-miss')
  assert.equal(triager.script.canonicalOwnerValidation, 'NOT_REACHED_BY_OFFLINE_COMPLEMENT')
  assert.equal(triager.script.nativeFirstLayer, 'UNQUALIFIED')
})

test('outer-call expansion, denials, and scratch payloads remain bounded', () => {
  assert.equal(POLICY.outerCalls.expansion, 'ONE_OUTER_PER_INNER_V1')
  assert.equal(POLICY.outerCalls.routeQualification, 'UNQUALIFIED')
  assert.equal(POLICY.outerCalls.aggregateMaximum, 36)
  assert.equal(
    Object.values(POLICY.outerCalls.ceilings).reduce((sum, n) => sum + n, 0),
    36,
  )
  for (const item of POLICY.cases) {
    const ceiling = item.limits.scopedCalls || (item.phase === 'T3' ? 1 : 0)
    assert.equal(POLICY.outerCalls.ceilings[item.id], ceiling)
    assert.ok(item.script)
  }
  for (const id of ['T1', 'P00', 'B14']) assert.equal(POLICY.outerCalls.ceilings[id], 0)
  assert.equal(casePolicy('P00').script.turnStarts, 0)
  assert.deepEqual(casePolicy('B14').script.reply, { permissions: {}, scope: 'turn' })
  assert.equal(casePolicy('B14').script.grants, 0)
  assert.deepEqual(casePolicy('N01').script.workspaceAction, {
    relativePath: 'scratch/n01.txt',
    content: 'M02-TA-N01\n',
    verify: 'read-same-bytes',
  })
  assert.deepEqual(casePolicy('N02').script.workspaceAction, {
    relativePath: 'scratch/n02.txt',
    content: 'M02-TA-N02\n',
    verify: 'read-same-bytes',
  })
  assert.equal(casePolicy('N01').script.nativeToolRoute, 'UNQUALIFIED')
  assert.equal(casePolicy('N02').script.nativeToolRoute, 'UNQUALIFIED')
  for (let number = 8; number <= 13; number++)
    assert.throws(() => casePolicy(`B${String(number).padStart(2, '0')}`), /unknown trusted case/)
})
