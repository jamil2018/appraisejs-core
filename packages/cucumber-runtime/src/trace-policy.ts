import type { BrowserContext } from 'playwright'

/** Credential-bearing scenarios must never record Playwright action parameters. */
export function runtimeTraceAllowed(resolvedPassword = process.env.APPRAISE_ENV_PASSWORD): boolean {
  return !resolvedPassword
}

export async function startRuntimeTrace(
  context: BrowserContext,
  resolvedPassword = process.env.APPRAISE_ENV_PASSWORD,
): Promise<boolean> {
  if (!runtimeTraceAllowed(resolvedPassword)) return false
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  return true
}

/**
 * A credential discovered after tracing starts is still sensitive: discard the
 * in-memory trace and do not ask the caller to allocate an artifact path.
 */
export async function stopRuntimeTrace(input: {
  context: BrowserContext
  traceStarted: boolean
  failed: boolean
  createTracePath: () => Promise<string>
  resolvedPassword?: string
}): Promise<string | undefined> {
  if (!input.traceStarted) return undefined
  if (!runtimeTraceAllowed(input.resolvedPassword)) {
    await input.context.tracing.stop()
    return undefined
  }
  if (!input.failed) {
    await input.context.tracing.stop()
    return undefined
  }
  const tracePath = await input.createTracePath()
  await input.context.tracing.stop({ path: tracePath })
  return tracePath
}
