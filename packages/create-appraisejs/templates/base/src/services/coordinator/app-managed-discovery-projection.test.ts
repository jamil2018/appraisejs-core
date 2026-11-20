import { describe, expect, it } from 'vitest'
import { builtInStepDefinitions } from '../../../packages/cucumber-runtime/src/step-definitions'
import { computeStepDefinitionHashes } from '../../../packages/cucumber-runtime/src/step-definitions/contracts'
import { defaultOperationDefinitions } from '@/lib/operation-catalog'
import { hashAutomationMaterialization } from '@/lib/quality-journey/automation-contracts'
import { pinnedDiscoveryOperation, projectAppManagedDiscoverySelection } from './app-managed-discovery-projection'

const hash = `sha256:${'a'.repeat(64)}`
const definition = builtInStepDefinitions.find(row => row.identity.id === 'browser.navigation.goto')!
const operation = defaultOperationDefinitions.find(row => row.id === 'browser.navigation.goto')!
function fixture() {
  const resources = [
    { id: 'module:checkout', kind: 'MODULE', contentHash: hash, sourceTargetProjectId: 'target' },
    {
      id: 'step:browser.navigation.goto:1',
      kind: 'STEP_DEFINITION',
      contentHash: computeStepDefinitionHashes(definition).definitionHash,
      sourceTargetProjectId: null,
    },
    {
      id: 'operation:browser.navigation.goto:1',
      kind: 'OPERATION',
      contentHash: hashAutomationMaterialization(operation),
      sourceTargetProjectId: null,
    },
  ]
  const task = {
    binding: {
      role: 'RESOURCE_EXPLORER',
      journeyId: 'journey',
      targetProjectId: 'target',
      workItemId: 'work',
      attemptId: 'attempt',
    },
    discoveryRevisionId: 'discovery',
    submissionIdempotencyKey: 'submit',
    submitTool: 'quality_journey_discovery_resources_submit',
    authority: { authorizationId: 'authorization', inputHash: hash, assignmentScopeHash: hash },
    data: {
      cycleId: 'cycle',
      approvedRequirementSetHash: hash,
      analysisRevision: { artifactId: 'charter', revisionId: 'analysis', contentHash: hash },
      analysisApproval: { artifactId: 'approval', contentHash: hash },
      inputArtifacts: [
        { kind: 'ANALYSIS_CHARTER_REVISION', artifactId: 'charter', revisionId: 'analysis', contentHash: hash },
        { kind: 'JOURNEY_APPROVAL', artifactId: 'approval', contentHash: hash },
      ],
      scope: { resources },
      analysisCharter: { requirements: [{ requirementId: 'requirement' }] },
    },
  } as unknown as Parameters<typeof projectAppManagedDiscoverySelection>[0]
  return {
    task,
    resources,
    selection: {
      destinationResourceIndex: 0,
      classifications: [
        {
          resourceIndex: 1,
          requirementIndex: 0,
          classification: 'COMPATIBLE',
          rationale: 'Use navigation for the approved route.',
        },
      ],
      missing: [],
    },
  }
}

describe('managed Discovery pinned executable resources', () => {
  it('makes the selected READY step operation explicit before normal Automator issuance', () => {
    const f = fixture()
    const call = projectAppManagedDiscoverySelection(f.task, f.selection)
    expect(call.arguments.bundle).toMatchObject({
      reusable: [
        { resourceId: 'step:browser.navigation.goto:1', resourceKind: 'STEP_DEFINITION' },
        { resourceId: 'operation:browser.navigation.goto:1', resourceKind: 'OPERATION' },
      ],
    })
  })
  it('refuses changed definition or operation bytes and never infers unrelated operations', () => {
    const f = fixture()
    f.resources[2].contentHash = hash
    expect(() => projectAppManagedDiscoverySelection(f.task, f.selection)).toThrow('frozen Discovery resource')
    f.resources[1].contentHash = hash
    expect(() => pinnedDiscoveryOperation(f.resources[1].id, f.resources)).toThrow('frozen READY source')
    expect(pinnedDiscoveryOperation('locator:unrelated', f.resources)).toBeNull()
  })
  it('rejects incompatible classifications of a selected step executable dependency', () => {
    const f = fixture()
    f.selection.classifications.push({
      resourceIndex: 2,
      requirementIndex: 0,
      classification: 'INCOMPATIBLE',
      rationale: 'Incompatible execution cannot be hidden by selecting its step.',
    })
    expect(() => projectAppManagedDiscoverySelection(f.task, f.selection)).toThrow(
      'conflicts with its pinned operation',
    )
  })
})
