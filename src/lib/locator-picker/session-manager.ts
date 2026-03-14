import prisma from '@/config/db-config'
import type {
  LocatorPickerGroupSuggestion,
  LocatorPickerSession,
  PickedElement,
  SelectorCandidate,
  SelectorStrategy,
  StartLocatorPickerSessionRequest,
} from '@/types/locator-picker'
import { BrowserEngine } from '@prisma/client'
import { mkdir } from 'fs/promises'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import { chromium, firefox, webkit, type Browser, type BrowserContext, type Frame, type Page } from 'playwright'
import type { Module } from '@prisma/client'

interface SessionRecord {
  browser?: Browser
  context?: BrowserContext
  activePage?: Page
  status: LocatorPickerSession['status']
  selectionMode: boolean
  launchSource: LocatorPickerSession['launchSource']
  browserEngine: BrowserEngine
  currentUrl: string
  currentPathname: string
  pageTitle: string
  pickedElement?: PickedElement
  selectorCandidates: SelectorCandidate[]
  suggestedLocatorName?: string
  groupSuggestion?: LocatorPickerGroupSuggestion
  startedAt: Date
  updatedAt: Date
  error?: string
}

interface FrameElementMetadata {
  tagName: string
  id: string
  name: string
  title: string
  src: string
  dataTestId: string
  nthOfType: number
}

interface SelectedElementMetadata {
  tagName: string
  id: string
  text: string
  placeholder: string
  labelText: string
  classes: string[]
  attributes: Record<string, string>
  outerHTML: string
  currentUrl: string
  pathname: string
  pageTitle: string
  frameUrl: string
  isInFrame: boolean
}

interface CandidateDraft {
  selector: string
  strategy: SelectorStrategy
  description: string
  score: number
}

const PICKER_BINDING_NAME = '__appraiseLocatorPickerEmit'
const PICKER_TOKEN_ATTRIBUTE = 'data-appraise-locator-picker-token'
const PICKER_SCRIPT = `
(() => {
  const globalKey = '__APPRAISE_LOCATOR_PICKER__';
  if (window[globalKey]?.initialized) {
    return;
  }

  const state = {
    initialized: true,
    selectionMode: false,
    hoveredElement: null,
  };

  const style = document.createElement('style');
  style.setAttribute('data-appraise-locator-picker', 'true');
  style.textContent = \`
    .appraise-locator-picker-hover {
      outline: 2px solid #0f766e !important;
      outline-offset: 2px !important;
      background-color: rgba(15, 118, 110, 0.12) !important;
      cursor: crosshair !important;
    }
    html.appraise-locator-picker-selection,
    html.appraise-locator-picker-selection * {
      cursor: crosshair !important;
    }
  \`;
  document.documentElement.appendChild(style);

  const clearHover = () => {
    if (state.hoveredElement instanceof Element) {
      state.hoveredElement.classList.remove('appraise-locator-picker-hover');
    }
    state.hoveredElement = null;
  };

  const resolveElement = target => {
    if (target instanceof Element) {
      return target;
    }

    if (target instanceof Node) {
      return target.parentElement;
    }

    return null;
  };

  const setSelectionMode = enabled => {
    state.selectionMode = Boolean(enabled);
    document.documentElement.classList.toggle('appraise-locator-picker-selection', state.selectionMode);
    if (!state.selectionMode) {
      clearHover();
    }
  };

  const onMouseOver = event => {
    if (!state.selectionMode) {
      return;
    }

    const target = resolveElement(event.target);
    if (!target) {
      return;
    }

    clearHover();
    target.classList.add('appraise-locator-picker-hover');
    state.hoveredElement = target;
  };

  const onMouseOut = event => {
    if (!state.selectionMode) {
      return;
    }

    const target = resolveElement(event.target);
    if (target instanceof Element) {
      target.classList.remove('appraise-locator-picker-hover');
    }
  };

  const onClick = async event => {
    if (!state.selectionMode) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const target = resolveElement(event.target);
    if (!target) {
      return;
    }

    clearHover();
    const token = (globalThis.crypto && 'randomUUID' in globalThis.crypto)
      ? globalThis.crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(16).slice(2);
    target.setAttribute('${PICKER_TOKEN_ATTRIBUTE}', token);

    try {
      if (typeof window['${PICKER_BINDING_NAME}'] === 'function') {
        await window['${PICKER_BINDING_NAME}']({
          type: 'element-picked',
          token,
        });
      }
    } finally {
      setSelectionMode(false);
    }
  };

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('click', onClick, true);

  window[globalKey] = {
    initialized: true,
    setSelectionMode,
  };
})();
`

async function ensurePickerInjected(context: BrowserContext): Promise<void> {
  await Promise.all(
    context.pages().map(async page => {
      await Promise.all(
        page.frames().map(async frame => {
          await frame
            .evaluate(
              ({ bindingName, tokenAttribute }) => {
                const globalKey = '__APPRAISE_LOCATOR_PICKER__'
              const currentWindow = window as unknown as Window & {
                [key: string]: unknown
                __APPRAISE_LOCATOR_PICKER__?: { initialized?: boolean; setSelectionMode?: (enabled: boolean) => void }
              }

                if (currentWindow[globalKey] && currentWindow.__APPRAISE_LOCATOR_PICKER__?.initialized) {
                  return
                }

                const state: {
                  initialized: boolean
                  selectionMode: boolean
                  hoveredElement: Element | null
                } = {
                  initialized: true,
                  selectionMode: false,
                  hoveredElement: null,
                }

                const existingStyle = document.querySelector('[data-appraise-locator-picker="true"]')
                if (!existingStyle) {
                  const style = document.createElement('style')
                  style.setAttribute('data-appraise-locator-picker', 'true')
                  style.textContent = `
                  .appraise-locator-picker-hover {
                    outline: 2px solid #0f766e !important;
                    outline-offset: 2px !important;
                    background-color: rgba(15, 118, 110, 0.12) !important;
                    cursor: crosshair !important;
                  }
                  html.appraise-locator-picker-selection,
                  html.appraise-locator-picker-selection * {
                    cursor: crosshair !important;
                  }
                `
                  document.documentElement.appendChild(style)
                }

                const clearHover = () => {
                  if (state.hoveredElement instanceof Element) {
                    state.hoveredElement.classList.remove('appraise-locator-picker-hover')
                  }
                  state.hoveredElement = null
                }

                const resolveElement = (target: EventTarget | null) => {
                  if (target instanceof Element) {
                    return target
                  }

                  if (target instanceof Node) {
                    return target.parentElement
                  }

                  return null
                }

                const setSelectionMode = (enabled: boolean) => {
                  state.selectionMode = Boolean(enabled)
                  document.documentElement.classList.toggle('appraise-locator-picker-selection', state.selectionMode)
                  if (!state.selectionMode) {
                    clearHover()
                  }
                }

                const onMouseOver = (event: MouseEvent) => {
                  if (!state.selectionMode) {
                    return
                  }

                  const target = resolveElement(event.target)
                  if (!target) {
                    return
                  }

                  clearHover()
                  target.classList.add('appraise-locator-picker-hover')
                  state.hoveredElement = target
                }

                const onMouseOut = (event: MouseEvent) => {
                  if (!state.selectionMode) {
                    return
                  }

                  const target = resolveElement(event.target)
                  if (target) {
                    target.classList.remove('appraise-locator-picker-hover')
                  }
                }

                const onClick = async (event: MouseEvent) => {
                  if (!state.selectionMode) {
                    return
                  }

                  event.preventDefault()
                  event.stopPropagation()
                  event.stopImmediatePropagation()

                  const target = resolveElement(event.target)
                  if (!target) {
                    return
                  }

                  clearHover()
                  const token =
                    globalThis.crypto && 'randomUUID' in globalThis.crypto
                      ? globalThis.crypto.randomUUID()
                      : String(Date.now()) + Math.random().toString(16).slice(2)
                  target.setAttribute(tokenAttribute, token)

                  try {
                    const binding = currentWindow[bindingName]
                    if (typeof binding === 'function') {
                      await binding({
                        type: 'element-picked',
                        token,
                      })
                    }
                  } finally {
                    setSelectionMode(false)
                  }
                }

                document.addEventListener('mouseover', onMouseOver, true)
                document.addEventListener('mouseout', onMouseOut, true)
                document.addEventListener('click', onClick, true)

                currentWindow[globalKey] = {
                  initialized: true,
                  setSelectionMode,
                }
              },
              { bindingName: PICKER_BINDING_NAME, tokenAttribute: PICKER_TOKEN_ATTRIBUTE },
            )
            .catch(() => undefined)
        }),
      )
    }),
  )
}

function normalizeRoute(value: string | null | undefined): string {
  if (!value || value.trim() === '') {
    return '/'
  }

  try {
    const parsed = new URL(value)
    return parsed.pathname || '/'
  } catch {
    const route = value.trim()
    if (route === '') {
      return '/'
    }
    return route.startsWith('/') ? route : `/${route}`
  }
}

function safeUrlParts(url: string): { currentUrl: string; pathname: string } {
  if (!url) {
    return { currentUrl: '', pathname: '/' }
  }

  try {
    const parsed = new URL(url)
    return {
      currentUrl: parsed.toString(),
      pathname: parsed.pathname || '/',
    }
  } catch {
    return {
      currentUrl: url,
      pathname: normalizeRoute(url),
    }
  }
}

function updateRecord(record: SessionRecord, patch: Partial<SessionRecord>): void {
  Object.assign(record, patch)
  record.updatedAt = new Date()
}

function escapeForCss(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function escapeForRoleName(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function escapeForTextSelector(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function isLikelyStableIdentifier(value: string | null | undefined): value is string {
  if (!value) {
    return false
  }

  const normalized = value.trim()
  if (normalized === '' || normalized.length > 120) {
    return false
  }

  return !/\d{4,}/.test(normalized) && !/[A-Fa-f0-9]{8,}/.test(normalized)
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function humanizeSegment(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, match => match.toUpperCase())
}

function buildModulePathMap(modules: Module[]): Map<string, string> {
  const moduleById = new Map(modules.map(module => [module.id, module]))
  const result = new Map<string, string>()

  const buildPath = (module: Module): string => {
    const cached = result.get(module.id)
    if (cached) {
      return cached
    }

    if (!module.parentId) {
      const pathValue = `/${module.name}`
      result.set(module.id, pathValue)
      return pathValue
    }

    const parent = moduleById.get(module.parentId)
    const pathValue = parent ? `${buildPath(parent)}/${module.name}` : `/${module.name}`
    result.set(module.id, pathValue)
    return pathValue
  }

  for (const module of modules) {
    buildPath(module)
  }

  return result
}

function buildSuggestedLocatorName(element: PickedElement): string {
  const candidates = [
    element.accessibleName,
    element.labelText,
    element.attributes['data-testid'],
    element.attributes['data-test'],
    element.attributes['data-qa'],
    element.placeholder,
    element.id,
    element.text,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate)
    if (normalized) {
      return normalized.slice(0, 80)
    }
  }

  return humanizeSegment(element.tagName)
}

function parseAriaSnapshot(snapshot: string): { role: string; name: string } {
  const firstLine = snapshot
    .split('\n')
    .map(line => line.trim())
    .find(line => line.startsWith('- '))

  if (!firstLine) {
    return { role: '', name: '' }
  }

  const match = firstLine.match(/-\s+([^\s":]+)(?:\s+"([^"]+)")?:?/)
  return {
    role: normalizeText(match?.[1]),
    name: normalizeText(match?.[2]),
  }
}

async function ensureWritableTempDir(): Promise<void> {
  const tempDir = path.join(process.cwd(), '.tmp', 'playwright')
  await mkdir(tempDir, { recursive: true })
  process.env.TMPDIR = process.env.TMPDIR || tempDir
  process.env.TMP = process.env.TMP || tempDir
  process.env.TEMP = process.env.TEMP || tempDir

  if (os.platform() === 'win32') {
    process.env.TEMP = tempDir
    process.env.TMP = tempDir
  }
}

async function getFrameSelectorMetadata(frame: Frame): Promise<FrameElementMetadata | null> {
  if (!frame.parentFrame()) {
    return null
  }

  try {
    const frameElement = await frame.frameElement()
    return await frameElement.evaluate(element => {
      const frameNode = element as Element
      const siblingTagName = frameNode.tagName
      let nthOfType = 1
      let sibling = frameNode.previousElementSibling

      while (sibling) {
        if (sibling.tagName === siblingTagName) {
          nthOfType += 1
        }
        sibling = sibling.previousElementSibling
      }

      return {
        tagName: frameNode.tagName.toLowerCase(),
        id: frameNode.getAttribute('id') || '',
        name: frameNode.getAttribute('name') || '',
        title: frameNode.getAttribute('title') || '',
        src: frameNode.getAttribute('src') || '',
        dataTestId: frameNode.getAttribute('data-testid') || frameNode.getAttribute('data-test') || '',
        nthOfType,
      }
    })
  } catch {
    return null
  }
}

function buildFrameCssSelector(metadata: FrameElementMetadata): string {
  if (isLikelyStableIdentifier(metadata.id)) {
    return `#${escapeForCss(metadata.id)}`
  }

  if (isLikelyStableIdentifier(metadata.dataTestId)) {
    return `${metadata.tagName}[data-testid="${escapeForCss(metadata.dataTestId)}"]`
  }

  if (isLikelyStableIdentifier(metadata.name)) {
    return `${metadata.tagName}[name="${escapeForCss(metadata.name)}"]`
  }

  if (isLikelyStableIdentifier(metadata.title)) {
    return `${metadata.tagName}[title="${escapeForCss(metadata.title)}"]`
  }

  if (metadata.src) {
    const route = normalizeRoute(metadata.src)
    if (route !== '/') {
      return `${metadata.tagName}[src*="${escapeForCss(route)}"]`
    }
  }

  return `${metadata.tagName}:nth-of-type(${metadata.nthOfType})`
}

async function buildFramePrefix(frame: Frame): Promise<string> {
  const chain: string[] = []
  let currentFrame: Frame | null = frame

  while (currentFrame?.parentFrame()) {
    const metadata = await getFrameSelectorMetadata(currentFrame)
    if (!metadata) {
      break
    }

    chain.unshift(buildFrameCssSelector(metadata))
    currentFrame = currentFrame.parentFrame()
  }

  if (chain.length === 0) {
    return ''
  }

  return `${chain.join(' >> internal:control=enter-frame >> ')} >> internal:control=enter-frame >> `
}

async function validateCandidate(page: Page, selector: string, score: number): Promise<SelectorCandidate> {
  try {
    const locator = page.locator(selector)
    const count = await locator.count()
    const isVisible =
      count > 0
        ? await locator
            .first()
            .isVisible()
            .catch(() => false)
        : false

    return {
      selector,
      strategy: 'css',
      description: selector,
      count,
      isUnique: count === 1,
      isVisible,
      score: score + (count === 1 ? 40 : 0) + (isVisible ? 20 : 0) - Math.max(count - 1, 0) * 10,
    }
  } catch {
    return {
      selector,
      strategy: 'css',
      description: selector,
      count: 0,
      isUnique: false,
      isVisible: false,
      score,
    }
  }
}

function draftCandidate(
  selector: string,
  strategy: SelectorStrategy,
  description: string,
  score: number,
): CandidateDraft {
  return { selector, strategy, description, score }
}

function buildCssCandidate(metadata: SelectedElementMetadata): string | null {
  const parts: string[] = [metadata.tagName]

  if (isLikelyStableIdentifier(metadata.attributes['name'])) {
    parts.push(`[name="${escapeForCss(metadata.attributes['name'])}"]`)
  }

  if (isLikelyStableIdentifier(metadata.attributes['type'])) {
    parts.push(`[type="${escapeForCss(metadata.attributes['type'])}"]`)
  }

  if (isLikelyStableIdentifier(metadata.attributes['aria-label'])) {
    parts.push(`[aria-label="${escapeForCss(metadata.attributes['aria-label'])}"]`)
  }

  const stableClasses = metadata.classes.filter(value => isLikelyStableIdentifier(value)).slice(0, 2)
  if (parts.length === 1 && stableClasses.length > 0) {
    parts.push(...stableClasses.map(value => `.${escapeForCss(value)}`))
  }

  return parts.length > 1 ? `css=${parts.join('')}` : null
}

function buildXPathCandidate(metadata: SelectedElementMetadata): string {
  if (isLikelyStableIdentifier(metadata.id)) {
    return `xpath=//*[@id="${metadata.id.replace(/"/g, '\\"')}"]`
  }

  if (metadata.text) {
    return `xpath=//${metadata.tagName}[normalize-space()="${metadata.text.replace(/"/g, '\\"')}"]`
  }

  return `xpath=//${metadata.tagName}`
}

async function readElementMetadata(
  frame: Frame,
  token: string,
): Promise<{
  metadata: SelectedElementMetadata
  accessibleName?: string
  role?: string
}> {
  const locator = frame.locator(`[${PICKER_TOKEN_ATTRIBUTE}="${token}"]`).first()
  await locator.waitFor({ state: 'attached', timeout: 1500 })

  const metadata = await locator.evaluate(element => {
    const attributes = Object.fromEntries(
      element.getAttributeNames().map(attributeName => [attributeName, element.getAttribute(attributeName) || '']),
    )
    const labelCapableElement = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    const labels =
      'labels' in labelCapableElement && labelCapableElement.labels
        ? Array.from(labelCapableElement.labels)
            .map(label => label.textContent || '')
            .join(' ')
        : ''

    return {
      tagName: element.tagName.toLowerCase(),
      id: element.getAttribute('id') || '',
      text: (element.textContent || '').replace(/\s+/g, ' ').trim(),
      placeholder: element.getAttribute('placeholder') || '',
      labelText: labels.replace(/\s+/g, ' ').trim(),
      classes: Array.from(element.classList || []),
      attributes,
      outerHTML: element.outerHTML.slice(0, 4000),
      currentUrl: window.location.href,
      pathname: window.location.pathname || '/',
      pageTitle: document.title || '',
      frameUrl: window.location.href,
      isInFrame: window.top !== window.self,
    }
  })

  let accessibleName = ''
  let role = ''

  try {
    const snapshot = await locator.ariaSnapshot({ timeout: 1000 })
    const parsed = parseAriaSnapshot(snapshot)
    accessibleName = parsed.name
    role = parsed.role
  } catch {
    accessibleName = ''
    role = ''
  }

  await locator.evaluate((element, attributeName) => {
    element.removeAttribute(attributeName)
  }, PICKER_TOKEN_ATTRIBUTE)

  return {
    metadata,
    accessibleName,
    role,
  }
}

async function buildSelectorCandidates(
  page: Page,
  frame: Frame,
  metadata: SelectedElementMetadata,
  accessibleName: string,
  role: string,
) {
  const framePrefix = await buildFramePrefix(frame)
  const drafts: CandidateDraft[] = []
  const seen = new Set<string>()

  const pushCandidate = (candidate: CandidateDraft) => {
    const fullSelector = `${framePrefix}${candidate.selector}`
    if (seen.has(fullSelector)) {
      return
    }

    seen.add(fullSelector)
    drafts.push({
      ...candidate,
      selector: fullSelector,
    })
  }

  for (const attributeName of ['data-testid', 'data-test', 'data-qa']) {
    const value = metadata.attributes[attributeName]
    if (isLikelyStableIdentifier(value)) {
      pushCandidate(
        draftCandidate(`css=[${attributeName}="${escapeForCss(value)}"]`, 'test-id', `${attributeName} attribute`, 120),
      )
    }
  }

  if (role && accessibleName) {
    pushCandidate(
      draftCandidate(
        `role=${role}[name="${escapeForRoleName(accessibleName)}"]`,
        'role',
        `role=${role} with accessible name`,
        110,
      ),
    )
  }

  if (metadata.labelText) {
    pushCandidate(
      draftCandidate(`label="${escapeForTextSelector(metadata.labelText)}"`, 'label', 'Associated label text', 100),
    )
  }

  if (metadata.placeholder) {
    pushCandidate(
      draftCandidate(
        `placeholder="${escapeForTextSelector(metadata.placeholder)}"`,
        'placeholder',
        'Placeholder text',
        95,
      ),
    )
  }

  if (metadata.text && metadata.text.length <= 80) {
    pushCandidate(draftCandidate(`text="${escapeForTextSelector(metadata.text)}"`, 'text', 'Visible text', 90))
  }

  if (isLikelyStableIdentifier(metadata.id)) {
    pushCandidate(draftCandidate(`css=#${escapeForCss(metadata.id)}`, 'id', 'Stable id attribute', 85))
  }

  const cssCandidate = buildCssCandidate(metadata)
  if (cssCandidate) {
    pushCandidate(draftCandidate(cssCandidate, 'css', 'Stable CSS attributes/classes', 70))
  }

  pushCandidate(draftCandidate(buildXPathCandidate(metadata), 'xpath', 'Fallback XPath', 40))

  const validated = await Promise.all(
    drafts.map(async draft => {
      const candidate = await validateCandidate(page, draft.selector, draft.score)
      return {
        ...candidate,
        strategy: draft.strategy,
        description: draft.description,
      }
    }),
  )

  return validated.sort((left, right) => right.score - left.score || left.count - right.count)
}

async function inferGroupSuggestion(pathname: string, pageTitle: string): Promise<LocatorPickerGroupSuggestion> {
  const route = normalizeRoute(pathname)
  const [locatorGroups, modules] = await Promise.all([
    prisma.locatorGroup.findMany({
      orderBy: {
        name: 'asc',
      },
    }),
    prisma.module.findMany({}),
  ])

  const exactMatch = locatorGroups.find(group => normalizeRoute(group.route) === route)
  if (exactMatch) {
    return {
      mode: 'existing',
      route,
      existingLocatorGroupId: exactMatch.id,
      existingLocatorGroupName: exactMatch.name,
      suggestedGroupName: exactMatch.name,
      suggestedModuleId: exactMatch.moduleId,
      requiresModuleSelection: false,
    }
  }

  const pathSegments = route.split('/').filter(Boolean)
  const defaultName =
    normalizeText(pageTitle) ||
    (pathSegments.length > 0 ? humanizeSegment(pathSegments[pathSegments.length - 1]) : 'Home')

  const modulePathMap = buildModulePathMap(modules)
  const sortedModulePaths = Array.from(modulePathMap.entries())
    .map(([moduleId, modulePath]) => ({ moduleId, modulePath }))
    .sort((left, right) => right.modulePath.length - left.modulePath.length)

  const matchedModule = sortedModulePaths.find(({ modulePath }) => {
    if (!modulePath || modulePath === '/root') {
      return false
    }

    if (route === modulePath) {
      return true
    }

    return route.startsWith(`${modulePath}/`)
  })

  let suggestedGroupName = defaultName
  let suffixCounter = 2
  const normalizedNames = new Set(locatorGroups.map(group => group.name.toLowerCase()))

  while (normalizedNames.has(suggestedGroupName.toLowerCase())) {
    suggestedGroupName = `${defaultName} ${suffixCounter}`
    suffixCounter += 1
  }

  return {
    mode: 'create',
    route,
    suggestedGroupName,
    suggestedModuleId: matchedModule?.moduleId,
    suggestedModulePath: matchedModule?.modulePath,
    requiresModuleSelection: !matchedModule?.moduleId,
  }
}

async function refreshPageState(record: SessionRecord): Promise<void> {
  if (!record.activePage || record.activePage.isClosed()) {
    return
  }

  const { currentUrl, pathname } = safeUrlParts(record.activePage.url())
  const pageTitle = await record.activePage.title().catch(() => record.pageTitle)

  updateRecord(record, {
    currentUrl,
    currentPathname: pathname,
    pageTitle: pageTitle || record.pageTitle,
  })
}

function browserTypeForEngine(browserEngine: BrowserEngine) {
  switch (browserEngine) {
    case BrowserEngine.FIREFOX:
      return firefox
    case BrowserEngine.WEBKIT:
      return webkit
    case BrowserEngine.CHROMIUM:
    default:
      return chromium
  }
}

class LocatorPickerSessionManager {
  private sessions = new Map<string, SessionRecord>()

  private constructor() {}

  static getInstance(): LocatorPickerSessionManager {
    const globalForLocatorPicker = global as unknown as {
      locatorPickerSessionManager?: LocatorPickerSessionManager
    }

    if (!globalForLocatorPicker.locatorPickerSessionManager) {
      globalForLocatorPicker.locatorPickerSessionManager = new LocatorPickerSessionManager()
    }

    return globalForLocatorPicker.locatorPickerSessionManager
  }

  private toSessionSnapshot(sessionId: string, record: SessionRecord): LocatorPickerSession {
    return {
      sessionId,
      launchSource: record.launchSource,
      browserEngine: record.browserEngine,
      status: record.status,
      selectionMode: record.selectionMode,
      currentUrl: record.currentUrl,
      currentPathname: record.currentPathname,
      pageTitle: record.pageTitle,
      pickedElement: record.pickedElement,
      selectorCandidates: record.selectorCandidates,
      suggestedLocatorName: record.suggestedLocatorName,
      groupSuggestion: record.groupSuggestion,
      startedAt: record.startedAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      error: record.error,
    }
  }

  private async attachPage(sessionId: string, page: Page): Promise<void> {
    const record = this.sessions.get(sessionId)
    if (!record) {
      return
    }

    record.activePage = page

    const refresh = async () => {
      const currentRecord = this.sessions.get(sessionId)
      if (!currentRecord) {
        return
      }

      currentRecord.activePage = page
      await refreshPageState(currentRecord)
    }

    page.on('framenavigated', async navigationFrame => {
      const currentRecord = this.sessions.get(sessionId)
      if (!currentRecord) {
        return
      }

      if (navigationFrame === page.mainFrame()) {
        currentRecord.pickedElement = undefined
        currentRecord.selectorCandidates = []
        currentRecord.suggestedLocatorName = undefined
        currentRecord.groupSuggestion = undefined
        currentRecord.status = currentRecord.selectionMode ? 'selecting' : 'ready'
      }

      await refresh()
    })

    page.on('load', refresh)
    page.on('close', () => {
      const currentRecord = this.sessions.get(sessionId)
      if (!currentRecord) {
        return
      }

      if (currentRecord.activePage === page) {
        const nextPage = currentRecord.context?.pages().find(candidate => !candidate.isClosed())
        currentRecord.activePage = nextPage
      }

      if (!currentRecord.activePage || currentRecord.activePage.isClosed()) {
        updateRecord(currentRecord, {
          status: 'closed',
          selectionMode: false,
          error: currentRecord.error,
        })
      }
    })
  }

  private async handleElementPicked(sessionId: string, page: Page, frame: Frame, token: string): Promise<void> {
    const record = this.sessions.get(sessionId)
    if (!record) {
      return
    }

    const { metadata, accessibleName, role } = await readElementMetadata(frame, token)
    const pickedElement: PickedElement = {
      tagName: metadata.tagName,
      id: metadata.id || undefined,
      text: normalizeText(metadata.text) || undefined,
      accessibleName: normalizeText(accessibleName) || undefined,
      role: normalizeText(role) || undefined,
      labelText: normalizeText(metadata.labelText) || undefined,
      placeholder: normalizeText(metadata.placeholder) || undefined,
      classes: metadata.classes,
      attributes: metadata.attributes,
      currentUrl: metadata.currentUrl,
      pathname: normalizeRoute(metadata.pathname),
      pageTitle: metadata.pageTitle,
      frameUrl: metadata.frameUrl,
      outerHTML: metadata.outerHTML,
      isInFrame: metadata.isInFrame,
    }

    const selectorCandidates = await buildSelectorCandidates(page, frame, metadata, accessibleName ?? '', role ?? '')
    const groupSuggestion = await inferGroupSuggestion(pickedElement.pathname, pickedElement.pageTitle)

    updateRecord(record, {
      activePage: page,
      status: selectorCandidates.length > 0 ? 'selected' : 'error',
      selectionMode: false,
      currentUrl: pickedElement.currentUrl,
      currentPathname: pickedElement.pathname,
      pageTitle: pickedElement.pageTitle,
      pickedElement,
      selectorCandidates,
      suggestedLocatorName: buildSuggestedLocatorName(pickedElement),
      groupSuggestion,
      error:
        selectorCandidates.length > 0
          ? undefined
          : 'No selector candidates could be generated for the selected element.',
    })
  }

  async startSession(request: StartLocatorPickerSessionRequest): Promise<LocatorPickerSession> {
    const browserEngine = request.browserEngine ?? BrowserEngine.CHROMIUM
    const environment = request.environmentId
      ? await prisma.environment.findUnique({
          where: {
            id: request.environmentId,
          },
        })
      : null

    const launchUrl = request.url?.trim() || environment?.baseUrl || ''
    if (!launchUrl) {
      throw new Error('Provide a URL or choose an environment before launching the picker.')
    }

    const normalizedUrl = /^https?:\/\//i.test(launchUrl) ? launchUrl : `https://${launchUrl}`
    const sessionId = randomUUID()
    const urlParts = safeUrlParts(normalizedUrl)

    const record: SessionRecord = {
      status: 'starting',
      selectionMode: false,
      launchSource: {
        environmentId: environment?.id,
        environmentName: environment?.name,
        url: normalizedUrl,
      },
      browserEngine,
      currentUrl: urlParts.currentUrl,
      currentPathname: urlParts.pathname,
      pageTitle: '',
      selectorCandidates: [],
      startedAt: new Date(),
      updatedAt: new Date(),
    }

    this.sessions.set(sessionId, record)

    try {
      await ensureWritableTempDir()

      const browser = await browserTypeForEngine(browserEngine).launch({
        headless: false,
      })
      const context = await browser.newContext()

      await context.exposeBinding(PICKER_BINDING_NAME, async ({ page: boundPage, frame }, payload) => {
        if (payload?.type === 'element-picked' && typeof payload.token === 'string') {
          await this.handleElementPicked(sessionId, boundPage, frame, payload.token)
        }
      })
      await context.addInitScript({ content: PICKER_SCRIPT })

      const page = await context.newPage()
      record.browser = browser
      record.context = context
      record.activePage = page

      context.on('page', async createdPage => {
        await this.attachPage(sessionId, createdPage)
      })

      browser.on('disconnected', () => {
        const currentRecord = this.sessions.get(sessionId)
        if (!currentRecord) {
          return
        }

        updateRecord(currentRecord, {
          status: currentRecord.status === 'error' ? 'error' : 'closed',
          selectionMode: false,
        })
      })

      await this.attachPage(sessionId, page)
      await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded' })
      await ensurePickerInjected(context)
      await refreshPageState(record)
      updateRecord(record, {
        status: 'ready',
        error: undefined,
      })

      return this.toSessionSnapshot(sessionId, record)
    } catch (error) {
      updateRecord(record, {
        status: 'error',
        selectionMode: false,
        error:
          error instanceof Error && error.message.includes("Executable doesn't exist")
            ? 'Playwright browser binaries are not installed. Run `npm run install-playwright -- chromium firefox webkit` and retry.'
            : error instanceof Error
              ? error.message
              : 'Failed to start the locator picker session.',
      })

      return this.toSessionSnapshot(sessionId, record)
    }
  }

  async getSession(sessionId: string): Promise<LocatorPickerSession | null> {
    const record = this.sessions.get(sessionId)
    if (!record) {
      return null
    }

    await refreshPageState(record).catch(() => undefined)
    return this.toSessionSnapshot(sessionId, record)
  }

  async updateSelectionMode(sessionId: string, enabled: boolean): Promise<LocatorPickerSession> {
    const record = this.sessions.get(sessionId)
    if (!record) {
      throw new Error('Locator picker session not found.')
    }

    if (!record.context) {
      throw new Error(record.error || 'Picker browser context is not available.')
    }

    await ensurePickerInjected(record.context)

    record.selectionMode = enabled
    record.status = enabled ? 'selecting' : record.pickedElement ? 'selected' : 'ready'
    record.error = undefined
    record.updatedAt = new Date()

    await Promise.all(
      record.context.pages().map(async page => {
        await Promise.all(
          page.frames().map(async frame => {
            await frame
              .evaluate(selectionEnabled => {
                const controller = (
                  window as unknown as {
                    __APPRAISE_LOCATOR_PICKER__?: { setSelectionMode?: (enabled: boolean) => void }
                  }
                ).__APPRAISE_LOCATOR_PICKER__
                controller?.setSelectionMode?.(selectionEnabled)
              }, enabled)
              .catch(() => undefined)
          }),
        )
      }),
    )

    return this.toSessionSnapshot(sessionId, record)
  }

  async markSaving(sessionId: string): Promise<void> {
    const record = this.sessions.get(sessionId)
    if (!record) {
      return
    }

    updateRecord(record, {
      status: 'saving',
      error: undefined,
    })
  }

  async markReadyAfterSave(sessionId: string): Promise<void> {
    const record = this.sessions.get(sessionId)
    if (!record) {
      return
    }

    updateRecord(record, {
      status: record.pickedElement ? 'selected' : 'ready',
    })
  }

  async closeSession(sessionId: string): Promise<LocatorPickerSession | null> {
    const record = this.sessions.get(sessionId)
    if (!record) {
      return null
    }

    try {
      await record.context?.close()
      await record.browser?.close()
    } catch {
      // no-op
    }

    updateRecord(record, {
      status: 'closed',
      selectionMode: false,
    })

    return this.toSessionSnapshot(sessionId, record)
  }
}

export const locatorPickerSessionManager = LocatorPickerSessionManager.getInstance()
