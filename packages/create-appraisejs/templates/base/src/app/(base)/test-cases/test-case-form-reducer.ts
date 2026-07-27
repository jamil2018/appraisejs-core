import type { FlowBlock, NodeOrderMap } from '@/types/diagram/diagram'
import type { Tag, TestSuite } from '@prisma/client'

export type TestCaseFormErrors = {
  templateTestCaseId?: string[]
  title?: string[]
  description?: string[]
  testSuiteIds?: string[]
  tagIds?: string[]
  steps?: string[]
}

export type AuthoringView = 'graph' | 'linear'

export type TestCaseFormState = {
  nodesOrder: NodeOrderMap
  flowBlocks: FlowBlock[]
  title: string
  description: string
  availableTestSuites: TestSuite[]
  availableTags: Tag[]
  selectedTestSuites: string[]
  selectedTags: string[]
  selectedTemplateId: string
  appliedTemplateId: string
  currentStep: number
  isCreateSuiteDialogOpen: boolean
  isCreateTagDialogOpen: boolean
  isFlowImmersive: boolean
  authoringView: AuthoringView
  errors: TestCaseFormErrors
}

type Updater<T> = T | ((prev: T) => T)

function applyUpdater<T>(updater: Updater<T>, prev: T): T {
  return typeof updater === 'function' ? (updater as (value: T) => T)(prev) : updater
}

function appendUniqueById<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some(currentItem => currentItem.id === item.id) ? items : [...items, item]
}

function appendUniqueId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id]
}

export type TestCaseFormAction =
  | { type: 'setCurrentStep'; step: number }
  | { type: 'setNodesOrder'; nodesOrder: NodeOrderMap }
  | { type: 'setFlowBlocks'; flowBlocks: FlowBlock[] }
  | { type: 'setTitle'; title: string }
  | { type: 'setDescription'; description: string }
  | { type: 'setSelectedTemplateId'; templateId: string }
  | { type: 'setAppliedTemplateId'; templateId: string }
  | { type: 'setSelectedTestSuites'; testSuiteIds: string[] }
  | { type: 'setSelectedTags'; tagIds: string[] }
  | { type: 'setIsCreateSuiteDialogOpen'; open: boolean }
  | { type: 'setIsCreateTagDialogOpen'; open: boolean }
  | { type: 'toggleFlowImmersive' }
  | { type: 'setAuthoringView'; view: AuthoringView }
  | { type: 'patchErrors'; updater: Updater<TestCaseFormErrors> }
  | { type: 'setErrors'; errors: TestCaseFormErrors }
  | { type: 'clearErrors' }
  | {
      type: 'applyTemplateConversion'
      payload: {
        title: string
        description: string
        nodesOrder: NodeOrderMap
        flowBlocks: FlowBlock[]
        appliedTemplateId: string
      }
    }
  | { type: 'addTestSuite'; testSuite: TestSuite }
  | { type: 'addTag'; tag: Tag }

export function testCaseFormReducer(state: TestCaseFormState, action: TestCaseFormAction): TestCaseFormState {
  switch (action.type) {
    case 'setCurrentStep':
      return { ...state, currentStep: action.step }
    case 'setNodesOrder':
      return {
        ...state,
        nodesOrder: action.nodesOrder,
        errors: { ...state.errors, steps: undefined },
      }
    case 'setFlowBlocks':
      return { ...state, flowBlocks: action.flowBlocks }
    case 'setTitle':
      return {
        ...state,
        title: action.title,
        errors: { ...state.errors, title: undefined },
      }
    case 'setDescription':
      return {
        ...state,
        description: action.description,
        errors: { ...state.errors, description: undefined },
      }
    case 'setSelectedTemplateId':
      return {
        ...state,
        selectedTemplateId: action.templateId,
        errors: { ...state.errors, templateTestCaseId: undefined },
      }
    case 'setAppliedTemplateId':
      return { ...state, appliedTemplateId: action.templateId }
    case 'setSelectedTestSuites':
      return {
        ...state,
        selectedTestSuites: action.testSuiteIds,
        errors: { ...state.errors, testSuiteIds: undefined },
      }
    case 'setSelectedTags':
      return {
        ...state,
        selectedTags: action.tagIds,
        errors: { ...state.errors, tagIds: undefined },
      }
    case 'setIsCreateSuiteDialogOpen':
      return { ...state, isCreateSuiteDialogOpen: action.open }
    case 'setIsCreateTagDialogOpen':
      return { ...state, isCreateTagDialogOpen: action.open }
    case 'toggleFlowImmersive':
      return { ...state, isFlowImmersive: !state.isFlowImmersive }
    case 'setAuthoringView':
      return { ...state, authoringView: action.view }
    case 'patchErrors':
      return { ...state, errors: applyUpdater(action.updater, state.errors) }
    case 'setErrors':
      return { ...state, errors: action.errors }
    case 'clearErrors':
      return { ...state, errors: {} }
    case 'applyTemplateConversion':
      return {
        ...state,
        title: action.payload.title,
        description: action.payload.description,
        nodesOrder: action.payload.nodesOrder,
        flowBlocks: action.payload.flowBlocks,
        appliedTemplateId: action.payload.appliedTemplateId,
        errors: { ...state.errors, steps: undefined, templateTestCaseId: undefined },
      }
    case 'addTestSuite':
      return {
        ...state,
        availableTestSuites: appendUniqueById(state.availableTestSuites, action.testSuite),
        selectedTestSuites: appendUniqueId(state.selectedTestSuites, action.testSuite.id),
        isCreateSuiteDialogOpen: false,
      }
    case 'addTag':
      return {
        ...state,
        availableTags: appendUniqueById(state.availableTags, action.tag),
        selectedTags: appendUniqueId(state.selectedTags, action.tag.id),
        isCreateTagDialogOpen: false,
      }
    default:
      return state
  }
}

export type CreateTestCaseFormStateInput = {
  defaultNodesOrder: NodeOrderMap
  defaultFlowBlocks: FlowBlock[]
  defaultTitle?: string
  defaultDescription?: string
  testSuites: TestSuite[]
  tags: Tag[]
  defaultTestSuiteIds?: string[]
  defaultTagIds?: string[]
  defaultTemplateTestCaseId?: string
  initialWizardStep: number
}

export function createTestCaseFormState({
  defaultNodesOrder,
  defaultFlowBlocks,
  defaultTitle,
  defaultDescription,
  testSuites,
  tags,
  defaultTestSuiteIds,
  defaultTagIds,
  defaultTemplateTestCaseId,
  initialWizardStep,
}: CreateTestCaseFormStateInput): TestCaseFormState {
  const templateId = defaultTemplateTestCaseId ?? ''

  return {
    nodesOrder: defaultNodesOrder,
    flowBlocks: defaultFlowBlocks,
    title: defaultTitle ?? '',
    description: defaultDescription ?? '',
    availableTestSuites: testSuites,
    availableTags: tags,
    selectedTestSuites: defaultTestSuiteIds ?? [],
    selectedTags: defaultTagIds ?? [],
    selectedTemplateId: templateId,
    appliedTemplateId: templateId,
    currentStep: initialWizardStep,
    isCreateSuiteDialogOpen: false,
    isCreateTagDialogOpen: false,
    isFlowImmersive: false,
    authoringView: 'graph',
    errors: {},
  }
}
