import type { Locator, Page } from 'playwright'

type StoredVariableReader = (name: string) => unknown

const MAX_JSON_LENGTH = 20_000
const MAX_JSON_DEPTH = 10
const MAX_ARRAY_LENGTH = 50

const locatorOptionKeys = {
  blur: ['timeout'],
  check: ['force', 'position', 'timeout'],
  click: ['button', 'clickCount', 'delay', 'force', 'modifiers', 'position', 'timeout'],
  dblclick: ['button', 'delay', 'force', 'modifiers', 'position', 'timeout'],
  dispatchEvent: ['timeout'],
  fill: ['force', 'timeout'],
  focus: ['timeout'],
  hover: ['force', 'modifiers', 'position', 'timeout'],
  press: ['delay', 'timeout'],
  pressSequentially: ['delay', 'timeout'],
  screenshot: ['animations', 'caret', 'omitBackground', 'quality', 'scale', 'timeout', 'type'],
  scrollIntoViewIfNeeded: ['timeout'],
  selectOption: ['force', 'timeout'],
  selectText: ['force', 'timeout'],
  setInputFiles: ['noWaitAfter', 'timeout'],
  tap: ['force', 'modifiers', 'position', 'timeout'],
  uncheck: ['force', 'position', 'timeout'],
} as const

const pageOptionKeys = {
  goBack: ['timeout', 'waitUntil'],
  goForward: ['timeout', 'waitUntil'],
  goto: ['referer', 'timeout', 'waitUntil'],
  reload: ['timeout', 'waitUntil'],
  screenshot: ['animations', 'caret', 'fullPage', 'omitBackground', 'quality', 'scale', 'timeout', 'type'],
  setViewportSize: [],
  waitForLoadState: ['timeout'],
  waitForTimeout: [],
  waitForURL: ['timeout', 'waitUntil'],
} as const

export type LocatorStepOperation = keyof typeof locatorOptionKeys
export type PageStepOperation = keyof typeof pageOptionKeys

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseJson(value: string, label: string): unknown {
  if (value.length > MAX_JSON_LENGTH) {
    throw new Error(`${label} JSON exceeds the ${MAX_JSON_LENGTH} character limit`)
  }

  try {
    return JSON.parse(value) as unknown
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function resolveStoredReferences(value: unknown, readStoredVariable: StoredVariableReader, depth = 0): unknown {
  if (depth > MAX_JSON_DEPTH) {
    throw new Error(`Structured operation JSON exceeds the maximum depth of ${MAX_JSON_DEPTH}`)
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) {
      throw new Error(`Structured operation arrays may contain at most ${MAX_ARRAY_LENGTH} values`)
    }
    return value.map(item => resolveStoredReferences(item, readStoredVariable, depth + 1))
  }

  if (!isPlainObject(value)) return value

  const keys = Object.keys(value)
  if (keys.length === 1 && keys[0] === '$stored') {
    const variableName = value.$stored
    if (typeof variableName !== 'string' || !variableName.trim()) {
      throw new Error('Stored-variable references must use {"$stored":"variableName"}')
    }
    return readStoredVariable(variableName)
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, resolveStoredReferences(item, readStoredVariable, depth + 1)]),
  )
}

function parseArguments(json: string, readStoredVariable: StoredVariableReader): unknown[] {
  const parsed = resolveStoredReferences(parseJson(json, 'Arguments'), readStoredVariable)
  if (!Array.isArray(parsed)) throw new Error('Arguments JSON must be an array')
  return parsed
}

function parseOptions(json: string, readStoredVariable: StoredVariableReader): Record<string, unknown> {
  const parsed = resolveStoredReferences(parseJson(json, 'Options'), readStoredVariable)
  if (!isPlainObject(parsed)) throw new Error('Options JSON must be an object')
  return parsed
}

function assertAllowedOptions(
  operation: string,
  options: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const unsupported = Object.keys(options).filter(key => !allowedKeys.includes(key))
  if (unsupported.length > 0) {
    throw new Error(`Unsupported option(s) for ${operation}: ${unsupported.join(', ')}`)
  }
}

function assertArgumentCount(operation: string, args: unknown[], minimum: number, maximum = minimum): void {
  if (args.length < minimum || args.length > maximum) {
    const expected = minimum === maximum ? String(minimum) : `${minimum}-${maximum}`
    throw new Error(`${operation} expects ${expected} argument(s), received ${args.length}`)
  }
}

function asOptions<T>(options: Record<string, unknown>): T {
  return options as T
}

export async function runLocatorStepOperation(
  locator: Locator,
  operationName: string,
  argumentsJson: string,
  optionsJson: string,
  readStoredVariable: StoredVariableReader,
): Promise<unknown> {
  if (!(operationName in locatorOptionKeys)) {
    throw new Error(`Unsupported locator operation: ${operationName}`)
  }

  const operation = operationName as LocatorStepOperation
  const args = parseArguments(argumentsJson, readStoredVariable)
  const options = parseOptions(optionsJson, readStoredVariable)
  assertAllowedOptions(operation, options, locatorOptionKeys[operation])

  switch (operation) {
    case 'blur':
      assertArgumentCount(operation, args, 0)
      return locator.blur(asOptions<Parameters<Locator['blur']>[0]>(options))
    case 'check':
      assertArgumentCount(operation, args, 0)
      return locator.check(asOptions<Parameters<Locator['check']>[0]>(options))
    case 'click':
      assertArgumentCount(operation, args, 0)
      return locator.click(asOptions<Parameters<Locator['click']>[0]>(options))
    case 'dblclick':
      assertArgumentCount(operation, args, 0)
      return locator.dblclick(asOptions<Parameters<Locator['dblclick']>[0]>(options))
    case 'dispatchEvent':
      assertArgumentCount(operation, args, 1, 2)
      if (typeof args[0] !== 'string') throw new Error('dispatchEvent requires an event-name string')
      return locator.dispatchEvent(
        args[0],
        args[1] as Parameters<Locator['dispatchEvent']>[1],
        asOptions<Parameters<Locator['dispatchEvent']>[2]>(options),
      )
    case 'fill':
      assertArgumentCount(operation, args, 1)
      if (typeof args[0] !== 'string') throw new Error('fill requires a string value')
      return locator.fill(args[0], asOptions<Parameters<Locator['fill']>[1]>(options))
    case 'focus':
      assertArgumentCount(operation, args, 0)
      return locator.focus(asOptions<Parameters<Locator['focus']>[0]>(options))
    case 'hover':
      assertArgumentCount(operation, args, 0)
      return locator.hover(asOptions<Parameters<Locator['hover']>[0]>(options))
    case 'press':
      assertArgumentCount(operation, args, 1)
      if (typeof args[0] !== 'string') throw new Error('press requires a key or shortcut string')
      return locator.press(args[0], asOptions<Parameters<Locator['press']>[1]>(options))
    case 'pressSequentially':
      assertArgumentCount(operation, args, 1)
      if (typeof args[0] !== 'string') throw new Error('pressSequentially requires a string value')
      return locator.pressSequentially(args[0], asOptions<Parameters<Locator['pressSequentially']>[1]>(options))
    case 'screenshot':
      assertArgumentCount(operation, args, 0)
      return locator.screenshot(asOptions<Parameters<Locator['screenshot']>[0]>(options))
    case 'scrollIntoViewIfNeeded':
      assertArgumentCount(operation, args, 0)
      return locator.scrollIntoViewIfNeeded(asOptions<Parameters<Locator['scrollIntoViewIfNeeded']>[0]>(options))
    case 'selectOption':
      assertArgumentCount(operation, args, 1)
      return locator.selectOption(
        args[0] as Parameters<Locator['selectOption']>[0],
        asOptions<Parameters<Locator['selectOption']>[1]>(options),
      )
    case 'selectText':
      assertArgumentCount(operation, args, 0)
      return locator.selectText(asOptions<Parameters<Locator['selectText']>[0]>(options))
    case 'setInputFiles':
      assertArgumentCount(operation, args, 1)
      if (
        typeof args[0] !== 'string' &&
        (!Array.isArray(args[0]) || !args[0].every(file => typeof file === 'string'))
      ) {
        throw new Error('setInputFiles accepts only a file path string or an array of file path strings')
      }
      return locator.setInputFiles(
        args[0] as Parameters<Locator['setInputFiles']>[0],
        asOptions<Parameters<Locator['setInputFiles']>[1]>(options),
      )
    case 'tap':
      assertArgumentCount(operation, args, 0)
      return locator.tap(asOptions<Parameters<Locator['tap']>[0]>(options))
    case 'uncheck':
      assertArgumentCount(operation, args, 0)
      return locator.uncheck(asOptions<Parameters<Locator['uncheck']>[0]>(options))
  }
}

export async function runPageStepOperation(
  page: Page,
  operationName: string,
  argumentsJson: string,
  optionsJson: string,
  readStoredVariable: StoredVariableReader,
): Promise<unknown> {
  if (!(operationName in pageOptionKeys)) {
    throw new Error(`Unsupported page operation: ${operationName}`)
  }

  const operation = operationName as PageStepOperation
  const args = parseArguments(argumentsJson, readStoredVariable)
  const options = parseOptions(optionsJson, readStoredVariable)
  assertAllowedOptions(operation, options, pageOptionKeys[operation])

  switch (operation) {
    case 'goBack':
      assertArgumentCount(operation, args, 0)
      return page.goBack(asOptions<Parameters<Page['goBack']>[0]>(options))
    case 'goForward':
      assertArgumentCount(operation, args, 0)
      return page.goForward(asOptions<Parameters<Page['goForward']>[0]>(options))
    case 'goto':
      assertArgumentCount(operation, args, 1)
      if (typeof args[0] !== 'string') throw new Error('goto requires a URL string')
      return page.goto(args[0], asOptions<Parameters<Page['goto']>[1]>(options))
    case 'reload':
      assertArgumentCount(operation, args, 0)
      return page.reload(asOptions<Parameters<Page['reload']>[0]>(options))
    case 'screenshot':
      assertArgumentCount(operation, args, 0)
      return page.screenshot(asOptions<Parameters<Page['screenshot']>[0]>(options))
    case 'setViewportSize': {
      assertArgumentCount(operation, args, 1)
      const viewport = args[0]
      if (
        !isPlainObject(viewport) ||
        !Number.isInteger(viewport.width) ||
        !Number.isInteger(viewport.height) ||
        Number(viewport.width) <= 0 ||
        Number(viewport.height) <= 0
      ) {
        throw new Error('setViewportSize requires {"width":positiveInteger,"height":positiveInteger}')
      }
      return page.setViewportSize({ width: Number(viewport.width), height: Number(viewport.height) })
    }
    case 'waitForLoadState':
      assertArgumentCount(operation, args, 0, 1)
      if (args[0] !== undefined && !['load', 'domcontentloaded', 'networkidle'].includes(String(args[0]))) {
        throw new Error('waitForLoadState accepts load, domcontentloaded, or networkidle')
      }
      return page.waitForLoadState(
        args[0] as Parameters<Page['waitForLoadState']>[0],
        asOptions<Parameters<Page['waitForLoadState']>[1]>(options),
      )
    case 'waitForTimeout':
      assertArgumentCount(operation, args, 1)
      if (typeof args[0] !== 'number' || !Number.isFinite(args[0]) || args[0] < 0 || args[0] > 120_000) {
        throw new Error('waitForTimeout requires milliseconds between 0 and 120000')
      }
      return page.waitForTimeout(args[0])
    case 'waitForURL':
      assertArgumentCount(operation, args, 1)
      if (typeof args[0] !== 'string') throw new Error('waitForURL requires a URL string or glob')
      return page.waitForURL(args[0], asOptions<Parameters<Page['waitForURL']>[1]>(options))
  }
}
