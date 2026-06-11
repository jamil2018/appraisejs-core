import {
  Blocks,
  Code,
  Component,
  FileCheck,
  Group,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  Network,
  Puzzle,
  Server,
  Settings2,
  Tag,
  TestTubeDiagonal,
  TestTubes,
  type LucideIcon,
} from 'lucide-react'

export type SearchCommandMode =
  | 'search-test-suite'
  | 'search-test-case'
  | 'search-template-step'
  | 'search-test-run'
  | 'search-template-test-case'

export type CommandMode = SearchCommandMode | null

export type NavigationCommandItem = {
  href: string
  label: string
  icon: LucideIcon
}

export type NavigationCommandGroup = {
  heading: string
  items: NavigationCommandItem[]
}

export type SearchCommandItem = {
  mode: SearchCommandMode
  label: string
  icon: LucideIcon
}

export const defaultCommandPlaceholder = 'Type a command or search...'

export const commandModePlaceholders: Record<SearchCommandMode, string> = {
  'search-test-suite': 'Search Test Suite by Name...',
  'search-test-case': 'Search Test Case by Title...',
  'search-template-step': 'Search Template Step by Name...',
  'search-test-run': 'Search Test Run by Name...',
  'search-template-test-case': 'Search Template Test Case by Name...',
}

const commandModeLabels: Record<SearchCommandMode, string> = {
  'search-test-suite': 'Search Test Suite',
  'search-test-case': 'Search Test Case',
  'search-template-step': 'Search Template Step',
  'search-test-run': 'Search Test Run',
  'search-template-test-case': 'Search Template Test Case',
}

export const navigationCommandGroups: NavigationCommandGroup[] = [
  {
    heading: 'Overview',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/plans', label: 'Plans', icon: Network },
      { href: '/settings', label: 'Settings', icon: Settings2 },
    ],
  },
  {
    heading: 'Automate',
    items: [
      { href: '/test-suites', label: 'Test Suites', icon: TestTubes },
      { href: '/test-cases', label: 'Test Cases', icon: TestTubeDiagonal },
      { href: '/test-runs', label: 'Test Runs', icon: ListChecks },
      { href: '/reports', label: 'Reports', icon: FileCheck },
      { href: '/test-runs/create', label: 'Create Test Run', icon: ListChecks },
      { href: '/test-suites/create', label: 'Create Test Suite', icon: TestTubes },
      { href: '/test-cases/create', label: 'Create Test Case', icon: TestTubeDiagonal },
    ],
  },
  {
    heading: 'Template',
    items: [
      { href: '/template-steps', label: 'Template Steps', icon: LayoutTemplate },
      { href: '/template-step-groups', label: 'Template Step Groups', icon: Component },
      { href: '/template-test-cases', label: 'Template Test Cases', icon: Blocks },
      { href: '/template-steps/create', label: 'Create Template Step', icon: LayoutTemplate },
      { href: '/template-test-cases/create', label: 'Create Template Test Case', icon: Blocks },
    ],
  },
  {
    heading: 'Configuration',
    items: [
      { href: '/locators', label: 'Locators', icon: Code },
      { href: '/locator-groups', label: 'Locator Groups', icon: Group },
      { href: '/modules', label: 'Modules', icon: Puzzle },
      { href: '/environments', label: 'Environments', icon: Server },
      { href: '/tags', label: 'Tags', icon: Tag },
    ],
  },
]

export const searchCommandItems: SearchCommandItem[] = [
  { mode: 'search-test-case', label: 'Search Test Cases', icon: TestTubeDiagonal },
  { mode: 'search-test-suite', label: 'Search Test Suites', icon: TestTubes },
  { mode: 'search-template-step', label: 'Search Template Steps', icon: LayoutTemplate },
  { mode: 'search-test-run', label: 'Search Test Runs', icon: ListChecks },
  { mode: 'search-template-test-case', label: 'Search Template Test Cases', icon: Blocks },
]

export function getCommandBadge(commandMode: CommandMode, onClose: () => void) {
  if (!commandMode) {
    return undefined
  }

  return {
    label: commandModeLabels[commandMode],
    onClose,
  }
}
