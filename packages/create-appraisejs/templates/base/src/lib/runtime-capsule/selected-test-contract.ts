import type { StepInvocation } from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

type StepReference = StepInvocation['step']

export type SelectedTestNode = {
  [key: string]: unknown
  id: string
  testCaseIds: string[]
  appraiseArtifacts: {
    modules: Array<{ id: string; name: string; parentId?: string | null }>
    locatorGroups: Array<{ id: string; name: string; route: string; moduleId: string }>
    testSuites: Array<{ id: string; name: string; moduleId: string; testCaseIds: string[] }>
    testCases: Array<{
      id: string
      title: string
      description: string | null
      steps: Array<{
        id: string
        order: number
        label: string | null
        gherkinStep: string
        invocation?: StepInvocation
        parameters: unknown[]
      }>
    }>
    locators: Array<{ id: string; name: string; value: string; locatorGroupId: string }>
  }
  matrix: Array<{ browser: string; environment: string }>
}

export type SelectedTestRuntimeInput = {
  extensionPolicy: {
    declarationHash: string
    compilerVersion: string
    [key: string]: unknown
  }
  locatorBindings?: Array<{
    caseId: string
    stepId: string
    inputName: string
    cardinality: 'exactlyOne' | 'collection'
  }>
  operationCardinalities?: Array<{
    operation: string
    inputName: string
    cardinality: 'exactlyOne' | 'collection'
  }>
  locators: Array<{ binding: { id: string; name: string; value: string; locatorGroupId: string } }>
  expected: {
    scenarios: Array<{ scenarioId: string; caseId: string; stepIds: string[] }>
    scenarioCount: number
  }
  stepDefinitions: StepReference[]
  rootInvocations: Array<{ caseId: string; stepId: string; invocation: StepInvocation }>
  [key: string]: unknown
}
