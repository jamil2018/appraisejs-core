import { describe, expect, it } from 'vitest'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from './state'
import { createCustomExtensionPolicy } from '@/lib/validation-ast/extension-policy'
import {
  canonicalizeAndValidateQualityRealization,
  canonicalStepDefinitionClosure,
  generationIntentProjection,
} from './validation-realization'

const hash = (letter: string) => `sha256:${letter.repeat(64)}`
const invocation = (id: string, definitionHash: string) => ({
  step: { id, version: '1', definitionHash },
  inputs: {},
  presentation: { keyword: 'Given' as const, description: `${id} is ready` },
})

function expectClosureConflict(run: () => unknown) {
  try {
    run()
    throw new Error('Expected a closure conflict')
  } catch (error) {
    expect(error).toMatchObject({ code: 'CONFLICT', details: { code: 'conflicting_step_definition_reference' } })
  }
}

function realizationWith(invocations: Array<ReturnType<typeof invocation>>) {
  const target = { id: 'target-closure', fingerprint: hash('c') }
  const gherkin = ['Scenario: closure\n  Given closure is ready']
  const compilerReceipt = {
    schemaVersion: '1',
    catalogHash: hash('d'),
    locatorGraphHash: hash('e'),
    environments: ['env-closure'],
    browsers: ['chromium'],
    runtimes: ['node'],
  }
  const steps = invocations.map((value, index) => ({
    id: `step-${index + 1}`,
    order: index + 1,
    label: `step ${index + 1}`,
    gherkinStep: 'Given closure is ready',
    invocation: value,
    parameters: [],
  }))
  const runtimeInput = {
    schemaVersion: '2',
    targetProjectId: target.id,
    targetFingerprint: target.fingerprint,
    astId: 'validation-closure',
    astHash: hash('f'),
    contextHash: hash('1'),
    previewHash: hash('2'),
    receiptHash: hash('3'),
    compilerReceipt: { ...compilerReceipt, contentHash: hashCanonical(compilerReceipt) },
    extensionPolicy: createCustomExtensionPolicy({
      projectId: target.id,
      projectFingerprint: target.fingerprint,
      capabilityImports: {},
    }),
    rootInvocations: steps.map(step => ({ caseId: 'case-closure', stepId: step.id, invocation: step.invocation })),
    stepDefinitions: invocations.map(value => value.step),
    locators: [],
    extensions: [],
    matrix: [{ browser: 'chromium', environment: 'env-closure' }],
    expected: {
      scenarios: [{ scenarioId: 'validation-closure', caseId: 'case-closure', stepIds: steps.map(step => step.id) }],
      scenarioCount: 1,
    },
    gherkinHash: hashCanonical(gherkin),
  }
  const node = {
    id: 'validation-closure',
    testCaseIds: ['case-closure'],
    appraiseArtifacts: {
      modules: [{ id: 'module-closure', name: 'Closure', parentId: null }],
      locatorGroups: [],
      testSuites: [{ id: 'suite-closure', name: 'Closure', moduleId: 'module-closure', testCaseIds: ['case-closure'] }],
      testCases: [{ id: 'case-closure', title: 'Closure', description: 'Closure.', steps }],
      locators: [],
    },
    matrix: runtimeInput.matrix,
  }
  return {
    target,
    realization: {
      runtimePublication: {
        idempotencyKey: 'closure',
        projection: { validationNode: node, gherkin },
        validationProjection: { validations: [node], gherkin },
        runtimeInput,
        extensionReviews: [],
      },
    },
  }
}

describe('canonical Quality realization closure', () => {
  it('deduplicates repeated exact Step Definitions', () => {
    expect(
      canonicalStepDefinitionClosure([
        { caseId: 'case-1', stepId: 'step-1', invocation: invocation('browser.same', hash('a')) },
        { caseId: 'case-1', stepId: 'step-2', invocation: invocation('browser.same', hash('a')) },
      ]),
    ).toEqual([{ id: 'browser.same', version: '1', definitionHash: hash('a') }])
  })

  it('has byte-identical closure output for reverse-ordered exact references', () => {
    const first = { caseId: 'case-1', stepId: 'step-a', invocation: invocation('browser.alpha', hash('a')) }
    const second = { caseId: 'case-1', stepId: 'step-b', invocation: invocation('browser.beta', hash('b')) }
    expect(canonicalContractJson(canonicalStepDefinitionClosure([first, second]))).toBe(
      canonicalContractJson(canonicalStepDefinitionClosure([second, first])),
    )
  })

  it('rejects conflicting hashes for one Step Definition identity in either order', () => {
    const first = { caseId: 'case-1', stepId: 'step-a', invocation: invocation('browser.same', hash('a')) }
    const second = { caseId: 'case-1', stepId: 'step-b', invocation: invocation('browser.same', hash('b')) }
    for (const values of [
      [first, second],
      [second, first],
    ])
      expectClosureConflict(() => canonicalStepDefinitionClosure(values))
  })

  it('rejects conflicting closure identities at the full canonicalization boundary', () => {
    const fixture = realizationWith([invocation('browser.same', hash('a')), invocation('browser.same', hash('b'))])
    expectClosureConflict(() => canonicalizeAndValidateQualityRealization(fixture))
  })

  it('rejects an assertion-only scenario before a managed page can be published or run', () => {
    const fixture = realizationWith([invocation('browser.assertions.visible', hash('a'))])

    expect(() => canonicalizeAndValidateQualityRealization(fixture)).toThrow('must navigate before')
    try {
      canonicalizeAndValidateQualityRealization(fixture)
    } catch (error) {
      expect(error).toMatchObject({
        code: 'VALIDATION',
        details: {
          code: 'scenario_page_context_required',
          targetOutcome: 'not_evaluated',
          caseId: 'case-closure',
          stepId: 'step-1',
          operation: 'browser.assertions.visible@1',
        },
      })
    }
  })

  it('accepts a locator assertion when the same authored scenario first navigates to its environment base URL', () => {
    const fixture = realizationWith([
      invocation('browser.navigation.navigate.to.environment.base.url', hash('a')),
      invocation('browser.assertions.visible', hash('b')),
    ])

    expect(canonicalizeAndValidateQualityRealization(fixture).runtimeInput.rootInvocations).toHaveLength(2)
  })

  it('does not treat reload or back as a fresh-page context establishment', () => {
    for (const navigation of ['browser.navigation.reload', 'browser.navigation.go.back']) {
      const fixture = realizationWith([
        invocation(navigation, hash('a')),
        invocation('browser.assertions.visible', hash('b')),
      ])
      expect(() => canonicalizeAndValidateQualityRealization(fixture)).toThrow('must navigate before')
    }
  })

  it('removes persistence-only locator-group ownership from both sealed logical nodes', () => {
    const fixture = realizationWith([invocation('browser.same', hash('a'))])
    const publication = fixture.realization.runtimePublication
    const node = publication.projection.validationNode as {
      appraiseArtifacts: { locatorGroups: Array<Record<string, unknown>> }
    }
    node.appraiseArtifacts.locatorGroups.push({
      id: 'group-closure',
      name: 'Closure',
      route: '/',
      moduleId: 'module-closure',
      targetProjectId: fixture.target.id,
    })
    ;(
      publication.validationProjection.validations[0] as {
        appraiseArtifacts: { locatorGroups: Array<Record<string, unknown>> }
      }
    ).appraiseArtifacts.locatorGroups.push({
      id: 'group-closure',
      name: 'Closure',
      route: '/',
      moduleId: 'module-closure',
      targetProjectId: fixture.target.id,
    })

    const canonical = canonicalizeAndValidateQualityRealization(fixture)
    const projectionNode = canonical.envelope.projection as {
      validationNode: { appraiseArtifacts: { locatorGroups: Array<Record<string, unknown>> } }
    }
    const validationNode = canonical.envelope.validationProjection as {
      validations: Array<{ appraiseArtifacts: { locatorGroups: Array<Record<string, unknown>> } }>
    }

    expect(projectionNode.validationNode.appraiseArtifacts.locatorGroups[0]).not.toHaveProperty('targetProjectId')
    expect(validationNode.validations[0]!.appraiseArtifacts.locatorGroups[0]).not.toHaveProperty('targetProjectId')
    expect(canonicalContractJson(projectionNode.validationNode)).toBe(
      canonicalContractJson(validationNode.validations[0]),
    )
  })

  it('keeps review receipts out of preparation intent but seals them into full realization integrity', () => {
    const first = realizationWith([invocation('browser.same', hash('a'))])
    const second = structuredClone(first)
    ;(first.realization.runtimePublication as { reviewContent?: string }).reviewContent = '{"review":"first"}'
    ;(second.realization.runtimePublication as { reviewContent?: string }).reviewContent = '{"review":"second"}'

    const canonicalFirst = canonicalizeAndValidateQualityRealization(first)
    const canonicalSecond = canonicalizeAndValidateQualityRealization(second)

    expect(canonicalSecond.intentHash).toBe(canonicalFirst.intentHash)
    expect(canonicalSecond.integrityHash).not.toBe(canonicalFirst.integrityHash)
  })

  it('excludes extension-review receipts from generation intent while retaining them in the full artifact', () => {
    const first = {
      runtimePublication: {
        idempotencyKey: 'command-one',
        reviewContent: '{"review":"one"}',
        extensionReviews: [{ extensionId: 'extension', artifactHash: hash('a') }],
        projection: { validationNode: { astProvenance: { publishOperationId: 'astpub_one' } } },
        validationProjection: { validations: [{ astProvenance: { publishOperationId: 'astpub_one' } }] },
      },
    }
    const second = structuredClone(first)
    second.runtimePublication.reviewContent = '{"review":"two"}'
    second.runtimePublication.extensionReviews = [{ extensionId: 'extension', artifactHash: hash('b') }]

    expect(hashCanonical(generationIntentProjection(second))).toBe(hashCanonical(generationIntentProjection(first)))
    expect(hashCanonical(second)).not.toBe(hashCanonical(first))
  })
})
