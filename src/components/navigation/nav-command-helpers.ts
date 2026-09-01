import {
  Blocks,
  Code,
  FileCheck,
  Group,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  Network,
  FolderKanban,
  Puzzle,
  Route,
  Server,
  Settings2,
  Tag,
  TestTubeDiagonal,
  TestTubes,
  type LucideIcon,
} from 'lucide-react'

export type SearchCommandMode =
  'search-test-suite' | 'search-test-case' | 'search-test-run' | 'search-template-test-case'

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
  'search-test-run': 'Search Test Run by Name...',
  'search-template-test-case': 'Search Template Test Case by Name...',
}

const commandModeLabels: Record<SearchCommandMode, string> = {
  'search-test-suite': 'Search Test Suite',
  'search-test-case': 'Search Test Case',
  'search-test-run': 'Search Test Run',
  'search-template-test-case': 'Search Template Test Case',
}

export type NavigationCommandGroupOptions = {
  /** Retained until the provider configuration prop is removed from the layout shell. */
  providerRunsEnabled?: boolean
}

export type NavigationSection = {
  label: string
  items: NavigationCommandItem[]
}

function getControlSection(): NavigationSection {
  return {
    label: 'Control',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/quality-journeys', label: 'Quality Journeys', icon: Route },
      { href: '/quality-plans', label: 'Quality Plans', icon: Network },
      { href: '/assessments', label: 'Assessments', icon: ListChecks },
    ],
  }
}

function getExecutionSection(): NavigationSection {
  return {
    label: 'Execution',
    items: [
      { href: '/test-runs', label: 'Test Runs', icon: ListChecks },
      { href: '/reports', label: 'Reports', icon: FileCheck },
      { href: '/test-suites', label: 'Test Suites', icon: TestTubes },
      { href: '/test-cases', label: 'Test Cases', icon: TestTubeDiagonal },
    ],
  }
}

function getLibrarySection(): NavigationSection {
  return {
    label: 'Library',
    items: [
      { href: '/step-definitions', label: 'Step Definitions', icon: LayoutTemplate },
      { href: '/template-test-cases', label: 'Case Templates', icon: Blocks },
      { href: '/locators', label: 'Locators', icon: Code },
      { href: '/locator-groups', label: 'Locator Groups', icon: Group },
      { href: '/modules', label: 'Modules', icon: Puzzle },
      { href: '/environments', label: 'Environments', icon: Server },
      { href: '/tags', label: 'Tags', icon: Tag },
    ],
  }
}

function getSystemSection(): NavigationSection {
  return {
    label: 'System',
    items: [
      { href: '/projects', label: 'Projects', icon: FolderKanban },
      { href: '/settings', label: 'Settings', icon: Settings2 },
    ],
  }
}

export function getSidebarNavigationSections(_options: NavigationCommandGroupOptions = {}): NavigationSection[] {
  void _options
  return [getControlSection(), getExecutionSection(), getLibrarySection(), getSystemSection()]
}

export function getNavigationCommandGroups(_options: NavigationCommandGroupOptions = {}): NavigationCommandGroup[] {
  void _options
  const [control, execution, library, system] = getSidebarNavigationSections()

  return [
    { heading: control.label, items: control.items },
    {
      heading: execution.label,
      items: [
        ...execution.items,
        { href: '/test-runs/create', label: 'Create Test Run', icon: ListChecks },
        { href: '/test-suites/create', label: 'Create Test Suite', icon: TestTubes },
        { href: '/test-cases/create', label: 'Create Test Case', icon: TestTubeDiagonal },
      ],
    },
    {
      heading: library.label,
      items: [
        ...library.items.map(item =>
          item.href === '/template-test-cases' ? { ...item, label: 'Template Test Cases' } : item,
        ),
        { href: '/step-definitions/create', label: 'Create Step Definition', icon: LayoutTemplate },
        { href: '/template-test-cases/create', label: 'Create Template Test Case', icon: Blocks },
      ],
    },
    { heading: system.label, items: system.items },
  ]
}

export const searchCommandItems: SearchCommandItem[] = [
  { mode: 'search-test-case', label: 'Search Test Cases', icon: TestTubeDiagonal },
  { mode: 'search-test-suite', label: 'Search Test Suites', icon: TestTubes },
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
