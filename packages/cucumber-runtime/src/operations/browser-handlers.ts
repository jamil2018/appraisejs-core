import type { Locator, Page } from 'playwright'

import definitions from './definitions.json' with { type: 'json' }
import { operationContentHash } from './contracts.ts'
import type { OperationDefinition } from './contracts.ts'
import { waitForRouteSettled, withReviewedSelectorResolver } from '../locator.util.ts'
import { builtinBrowserOperations } from './builtins/index.ts'
import type { CustomWorld } from '../world.ts'
import { assertSealedPageOrigin, resolveSealedNavigationUrl, SealedOriginError } from './sealed-origin.ts'

export type BrowserOperationWorld = {
  page: Page
  sealedBaseUrl?: string
  browserRuntimeIssuesFor?: (scope: 'console-and-page' | 'network') => unknown[]
  recordHumanVerificationRequired?: (event: import('../captcha-detector.ts').HumanVerificationRequiredEvent) => void
}

export type BrowserOperationContext = {
  world: BrowserOperationWorld
  inputs: Record<string, unknown>
  resolveLocator: (reference: unknown) => Promise<Locator> | Locator
  resolveSelector?: (reference: unknown) => string | null
  /** Immutable managed-runtime binding data, keyed by canonical locator input name. */
  locatorCardinalities?: Record<string, 'exactlyOne' | 'collection'>
  /** Immutable managed-runtime cardinality data, keyed by operation ref and canonical input name. */
  operationCardinalities?: Record<string, Record<string, 'exactlyOne' | 'collection'>>
  baseUrl?: string
}

export class OperationExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'OperationExecutionError'
  }
}

type BrowserOperationHandler = (context: BrowserOperationContext) => Promise<unknown>

async function browserFailureDiagnostics(page: Page): Promise<string[]> {
  try {
    const messages = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="alert"], [aria-invalid="true"], input:invalid, select:invalid, textarea:invalid',
        ),
      )
      return candidates
        .filter(element => element.offsetParent !== null || element.getClientRects().length > 0)
        .flatMap(element => {
          const control = element as HTMLInputElement
          const text = element.innerText || element.textContent || control.validationMessage || ''
          return text.trim() ? [text.trim().replace(/\s+/g, ' ').slice(0, 200)] : []
        })
        .filter((message, index, all) => all.indexOf(message) === index)
        .slice(0, 5)
    })
    return Array.isArray(messages) && messages.every(message => typeof message === 'string') ? messages : []
  } catch {
    return []
  }
}

const required = (inputs: Record<string, unknown>, name: string) => {
  if (!(name in inputs))
    throw new OperationExecutionError('operation_input_missing', `Required input "${name}" is missing.`)
  return inputs[name]
}

const stringInput = (inputs: Record<string, unknown>, name: string) => String(required(inputs, name))
const numberInput = (inputs: Record<string, unknown>, name: string) => {
  const value = Number(required(inputs, name))
  if (!Number.isFinite(value))
    throw new OperationExecutionError('operation_input_invalid', `Input "${name}" must be finite.`)
  return value
}

const target = (context: BrowserOperationContext) => context.resolveLocator(required(context.inputs, 'target'))

type SourceOperation = Omit<OperationDefinition, 'handler'> & { handler: { id: string; version: string } }

const operationByRef = new Map(
  (definitions as SourceOperation[]).map(operation => [
    `${operation.handler.id}@${operation.handler.version}`,
    operation,
  ]),
)

async function enforceLocatorCardinality(ref: string, context: BrowserOperationContext): Promise<void> {
  const operation = operationByRef.get(ref)
  if (!operation) return
  for (const input of operation.inputs) {
    if (input.type !== 'locator') continue
    const cardinality =
      context.operationCardinalities?.[ref]?.[input.name] ??
      context.locatorCardinalities?.[input.name] ??
      input.cardinality
    if (!cardinality)
      throw new OperationExecutionError(
        'operation_locator_cardinality_missing',
        `Locator input "${input.name}" for operation "${ref}" has no cardinality declaration.`,
      )
    if (cardinality === 'collection') continue
    const locator = await context.resolveLocator(required(context.inputs, input.name))
    const matchCount = await locator.count()
    if (matchCount !== 1)
      throw new OperationExecutionError(
        'operation_locator_cardinality',
        `Locator input "${input.name}" for operation "${ref}" must match exactly one element; found ${matchCount}.`,
      )
  }
}

const assertEqual = (actual: unknown, expected: unknown, message: string) => {
  if (actual !== expected) throw new OperationExecutionError('operation_assertion_failed', `${message}.`)
}

const managedHandlers = {
  'browser.waits.timeout@1': async context => {
    await context.world.page.waitForTimeout(numberInput(context.inputs, 'timeout'))
  },
  'browser.assertions.visible@1': async context => {
    assertEqual(await (await target(context)).isVisible(), true, 'Expected target to be visible')
  },
  'browser.assertions.hidden@1': async context => {
    assertEqual(await (await target(context)).isVisible(), false, 'Expected target to be absent or hidden')
  },
  'browser.assertions.text@1': async context => {
    const actual = (await (await target(context)).textContent()) ?? ''
    const expected = stringInput(context.inputs, 'text')
    if (!actual.includes(expected))
      throw new OperationExecutionError('operation_assertion_failed', `Target text did not contain "${expected}".`)
  },
  'browser.assertions.no-console-errors@1': async context => {
    await waitForRouteSettled(context.world.page)
    const issues = context.world.browserRuntimeIssuesFor?.('console-and-page') ?? []
    assertEqual(issues.length, 0, 'Browser console or page errors were recorded')
  },
  'browser.assertions.no-failed-network-requests@1': async context => {
    await waitForRouteSettled(context.world.page)
    const issues = context.world.browserRuntimeIssuesFor?.('network') ?? []
    assertEqual(issues.length, 0, 'Failed browser network activity was recorded')
  },
  'browser.assertions.no-horizontal-overflow@1': async context => {
    const fits = await context.world.page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )
    assertEqual(fits, true, 'Document has horizontal overflow')
  },
  'browser.assertions.accessible@1': async context => {
    const accessibleName = await (
      await target(context)
    ).evaluate(element => {
      const labelledBy = element
        .getAttribute('aria-labelledby')
        ?.split(/\s+/)
        .map(id => document.getElementById(id)?.textContent ?? '')
        .join(' ')
      const formControl = element as Element & { labels?: ArrayLike<HTMLLabelElement> }
      const labels =
        'labels' in formControl
          ? Array.from(formControl.labels ?? [])
              .map(label => label.textContent ?? '')
              .join(' ')
          : ''
      return (
        [
          element.getAttribute('aria-label'),
          labelledBy,
          labels,
          element.getAttribute('alt'),
          element.getAttribute('title'),
          element.getAttribute('placeholder'),
          element.textContent,
        ].find(value => value?.trim()) ?? ''
      )
    })
    if (!accessibleName)
      throw new OperationExecutionError('operation_assertion_failed', 'Target has no accessible name.')
  },
  'browser.assertions.persisted@1': async context => {
    assertEqual(await (await target(context)).isVisible(), true, 'Persisted result target was not visible')
  },
} satisfies Record<string, BrowserOperationHandler>

const canonicalInputAliases: Record<string, Record<string, string>> = {
  'browser.mouse.click@1': { elementName: 'target' },
  'browser.forms.fill@1': { elementName: 'target' },
  'browser.keyboard.press@1': { shortcut: 'key' },
  'browser.keyboard.focus@1': { elementName: 'target' },
  'browser.waits.duration@1': { seconds: 'duration' },
  'browser.assertions.checked@1': { elementName: 'target', expected: 'checked' },
  'browser.assertions.value@1': { elementName: 'target', expected: 'value' },
}

const normalizeBuiltinInput = (
  ref: string,
  parameterName: string,
  value: unknown,
  context: BrowserOperationContext,
) => {
  if (ref !== 'browser.navigation.goto@1' || parameterName !== 'url') return value
  const url = String(value)
  return resolveSealedNavigationUrl(url, context.baseUrl)
}

function redactResolvedCredential(value: string) {
  const credential = process.env.APPRAISE_ENV_PASSWORD
  return credential ? value.split(credential).join('[REDACTED]') : value
}

function inputsContainResolvedCredential(value: unknown): boolean {
  const credential = process.env.APPRAISE_ENV_PASSWORD
  if (!credential) return false
  if (value === credential) return true
  if (!value || typeof value !== 'object') return false
  return Object.values(value).some(inputsContainResolvedCredential)
}

const builtinHandlers = Object.fromEntries(
  builtinBrowserOperations.map(operation => [
    `${operation.id}@${operation.version}`,
    async (context: BrowserOperationContext) => {
      const ref = `${operation.id}@${operation.version}`
      const aliases = canonicalInputAliases[ref] ?? {}
      const args = operation.parameters.map(parameter => {
        const value = required(context.inputs, aliases[parameter.name] ?? parameter.name)
        return normalizeBuiltinInput(ref, parameter.name, value, context)
      })
      const handler = operation.execute as (this: CustomWorld, ...parameters: unknown[]) => Promise<unknown>
      const execute = async () => {
        try {
          return await handler.apply(context.world as CustomWorld, args)
        } catch (error) {
          if (error instanceof OperationExecutionError) throw error
          if (error instanceof SealedOriginError) throw new OperationExecutionError('ORIGIN_DENIED', error.message)
          const diagnostics = await browserFailureDiagnostics(context.world.page)
          const diagnosticSuffix = diagnostics.length ? ` Visible validation: ${diagnostics.join(' | ')}` : ''
          throw new OperationExecutionError(
            operation.id.includes('assertion') ? 'operation_assertion_failed' : 'operation_execution_failed',
            redactResolvedCredential(`${error instanceof Error ? error.message : String(error)}${diagnosticSuffix}`),
          )
        }
      }
      if (!context.resolveSelector) return execute()
      return withReviewedSelectorResolver(
        context.world.page,
        locatorName => {
          const normalized =
            typeof locatorName === 'string'
              ? locatorName
              : String((locatorName as unknown as { id?: unknown })?.id ?? '')
          return context.resolveSelector?.({ id: normalized }) ?? null
        },
        execute,
      )
    },
  ]),
) as Record<string, BrowserOperationHandler>

const handlers = { ...managedHandlers, ...builtinHandlers } as Record<string, BrowserOperationHandler>
const builtinHandlerImplementations = Object.fromEntries(
  builtinBrowserOperations.map(operation => {
    const ref = `${operation.id}@${operation.version}`
    return [
      ref,
      {
        adapter: builtinHandlers[ref]?.toString(),
        implementation: operation.execute.toString(),
      },
    ]
  }),
) as Record<string, { adapter: string | undefined; implementation: string }>

export type BrowserOperationRef = string

export const browserOperationHandlerDescriptors = Object.fromEntries(
  Object.entries(handlers).map(([ref, execute]) => [
    ref,
    {
      ref,
      contentHash: operationContentHash({
        ref,
        implementation: builtinHandlerImplementations[ref] ?? execute.toString(),
      }),
    },
  ]),
) as Record<BrowserOperationRef, { ref: BrowserOperationRef; contentHash: string }>

export function listBrowserOperationHandlerRefs(): BrowserOperationRef[] {
  return Object.keys(handlers).sort() as BrowserOperationRef[]
}

export async function executeBrowserOperation(
  ref: string,
  context: BrowserOperationContext,
  allowedRefs?: ReadonlySet<string>,
): Promise<unknown> {
  if (allowedRefs && !allowedRefs.has(ref))
    throw new OperationExecutionError('operation_not_reviewed', `Operation "${ref}" is not in the reviewed closure.`)
  const handler = handlers[ref as BrowserOperationRef]
  if (!handler) throw new OperationExecutionError('operation_unknown', `Operation "${ref}" is not supported.`)
  context.world.sealedBaseUrl = context.baseUrl
  try {
    // A fresh browser starts at about:blank; any later operation must stay on the sealed origin.
    assertSealedPageOrigin(context.world.page.url(), context.baseUrl, !inputsContainResolvedCredential(context.inputs))
  } catch (error) {
    if (error instanceof SealedOriginError) throw new OperationExecutionError('ORIGIN_DENIED', error.message)
    throw error
  }
  await enforceLocatorCardinality(ref, context)
  try {
    const result = await handler(context)
    assertSealedPageOrigin(context.world.page.url(), context.baseUrl)
    return result
  } catch (error) {
    if (error instanceof OperationExecutionError)
      throw new OperationExecutionError(error.code, redactResolvedCredential(error.message))
    if (error instanceof SealedOriginError) throw new OperationExecutionError('ORIGIN_DENIED', error.message)
    throw error
  }
}

export async function executeBuiltinHumanOperation(
  ref: string,
  world: CustomWorld,
  parameters: unknown[],
): Promise<unknown> {
  const operation = builtinBrowserOperations.find(candidate => `${candidate.id}@${candidate.version}` === ref)
  if (!operation) throw new OperationExecutionError('operation_unknown', `Operation "${ref}" is not supported.`)
  const handler = operation.execute as (this: CustomWorld, ...values: unknown[]) => Promise<unknown>
  return handler.apply(world, parameters)
}
