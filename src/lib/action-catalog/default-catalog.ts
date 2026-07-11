import { createActionCatalog, type ActionDescriptorDefinition } from './action-catalog'

const categories = [
  { id: 'browser', title: 'Browser', description: 'Actions executed in a browser runtime.' },
  {
    id: 'browser.navigation',
    parentCategoryId: 'browser',
    title: 'Navigation',
    description: 'Navigate browser pages.',
  },
  { id: 'browser.mouse', parentCategoryId: 'browser', title: 'Mouse', description: 'Interact with pointer targets.' },
  { id: 'browser.forms', parentCategoryId: 'browser', title: 'Forms', description: 'Edit browser form controls.' },
  { id: 'browser.waits', parentCategoryId: 'browser', title: 'Waits', description: 'Wait for browser state.' },
  { id: 'browser.assertions', parentCategoryId: 'browser', title: 'Assertions', description: 'Assert browser state.' },
] as const

const input = (name: string, type: string, description: string) => ({ name, type, required: true, description })
const browserAction = (
  action: Pick<
    ActionDescriptorDefinition,
    'id' | 'title' | 'description' | 'categories' | 'inputs' | 'requirements' | 'examples'
  > &
    Partial<Pick<ActionDescriptorDefinition, 'assertionConcerns'>>,
): ActionDescriptorDefinition => ({
  ...action,
  version: '1',
  outputs: [],
  assertionConcerns: action.assertionConcerns ?? [],
  deprecated: false,
})

const actions: ActionDescriptorDefinition[] = [
  browserAction({
    id: 'browser.navigation.goto',
    title: 'Navigate to URL',
    description: 'Navigate to an absolute or environment-relative URL.',
    categories: ['browser.navigation'],
    inputs: [input('url', 'string', 'Destination URL.')],
    requirements: { runtime: 'browser', capabilities: ['navigation'] },
    examples: [{ description: 'Open the home route.', inputs: { url: '/' } }],
  }),
  browserAction({
    id: 'browser.navigation.reload',
    title: 'Reload page',
    description: 'Reload the current browser page.',
    categories: ['browser.navigation'],
    inputs: [],
    requirements: { runtime: 'browser', capabilities: ['navigation'] },
    examples: [{ description: 'Reload the current page.', inputs: {} }],
  }),
  browserAction({
    id: 'browser.mouse.click',
    title: 'Click element',
    description: 'Click a resolved locator target.',
    categories: ['browser.mouse'],
    inputs: [input('target', 'locator', 'Locator reference to click.')],
    requirements: { runtime: 'browser', capabilities: ['mouse'] },
    examples: [{ description: 'Click submit.', inputs: { target: 'submit-button' } }],
  }),
  browserAction({
    id: 'browser.forms.fill',
    title: 'Fill field',
    description: 'Replace a field value through a resolved locator.',
    categories: ['browser.forms'],
    inputs: [input('target', 'locator', 'Locator reference to fill.'), input('value', 'string', 'Value to enter.')],
    requirements: { runtime: 'browser', capabilities: ['forms'] },
    examples: [{ description: 'Fill a title.', inputs: { target: 'title-input', value: 'Meditate' } }],
  }),
  browserAction({
    id: 'browser.waits.page-ready',
    title: 'Wait for page',
    description: 'Wait for the current page load state.',
    categories: ['browser.waits'],
    inputs: [],
    requirements: { runtime: 'browser', capabilities: ['waits'] },
    examples: [{ description: 'Wait after navigation.', inputs: {} }],
  }),
  browserAction({
    id: 'browser.waits.duration',
    title: 'Wait for duration',
    description: 'Wait for a bounded number of seconds.',
    categories: ['browser.waits'],
    inputs: [
      {
        ...input('duration', 'number', 'Duration in seconds.'),
        numeric: { unit: 'seconds', minimum: 0, maximum: 300 },
      },
    ],
    requirements: { runtime: 'browser', capabilities: ['waits'] },
    examples: [{ description: 'Wait briefly.', inputs: { duration: 1 } }],
  }),
  browserAction({
    id: 'browser.waits.timeout',
    title: 'Wait with timeout',
    description: 'Wait using a bounded millisecond timeout.',
    categories: ['browser.waits'],
    inputs: [
      {
        ...input('timeout', 'number', 'Timeout in milliseconds.'),
        numeric: { unit: 'milliseconds', minimum: 0, maximum: 300_000 },
      },
    ],
    requirements: { runtime: 'browser', capabilities: ['waits'] },
    examples: [{ description: 'Wait briefly.', inputs: { timeout: 1_000 } }],
  }),
  browserAction({
    id: 'browser.assertions.visible',
    title: 'Assert visible',
    description: 'Assert that a resolved locator is visible.',
    categories: ['browser.assertions'],
    inputs: [input('target', 'locator', 'Locator reference to inspect.')],
    requirements: { runtime: 'browser', capabilities: ['assertions'] },
    examples: [{ description: 'Verify confirmation.', inputs: { target: 'confirmation' } }],
  }),
  {
    ...browserAction({
      id: 'browser.assertions.accessible',
      title: 'Assert accessible',
      description: 'Assert that the resolved target exposes an accessible name and role.',
      categories: ['browser.assertions'],
      inputs: [input('target', 'locator', 'Locator reference to inspect.')],
      requirements: { runtime: 'browser', capabilities: ['assertions'] },
      examples: [{ description: 'Verify accessible control semantics.', inputs: { target: 'start-button' } }],
    }),
    assertionConcerns: ['accessibility'],
  },
  {
    ...browserAction({
      id: 'browser.assertions.persisted',
      title: 'Assert persisted result',
      description: 'Assert that a persisted result is represented by the resolved target.',
      categories: ['browser.assertions'],
      inputs: [input('target', 'locator', 'Locator reference containing the persisted result.')],
      requirements: { runtime: 'browser', capabilities: ['assertions'] },
      examples: [{ description: 'Verify persisted completion.', inputs: { target: 'completion' } }],
    }),
    assertionConcerns: ['persistence'],
  },
]

export const defaultActionCatalog = createActionCatalog({ categories: [...categories], actions })
