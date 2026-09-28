import { launchTargetTransport } from './c233-target-transport'

// Qualification harness only: not a production auth-policy implementation.
type Target = { targetId: string; type: string; browserContextId?: string; openerId?: string; subtype?: string }
type Attachment = { sessionId: string; targetInfo: Target; waitingForDebugger: boolean }
type RequestFacts = { url: string; method: string; resourceType: string; targetId: string }
type Pause = { requestId: string; request: { url: string; method: string }; resourceType: string }
type Options = {
  headless?: boolean
  allow(facts: RequestFacts): boolean
  admitDirectPopup?: boolean
  beforeTargetReady?: () => Promise<void>
  failCommand?: 'Fetch.enable' | 'Target.setAutoAttach'
}
const autoAttach = { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function hasValidAttachmentScope(event: Attachment, contextId: string) {
  return (
    typeof event.sessionId === 'string' &&
    event.sessionId.length > 0 &&
    typeof event.targetInfo.targetId === 'string' &&
    event.targetInfo.targetId.length > 0 &&
    event.targetInfo.browserContextId === contextId &&
    event.waitingForDebugger === true
  )
}
function eligiblePage(target: Target, seedId: string, seedReady: boolean, admitPopup: boolean) {
  if (target.type !== 'page' || target.subtype !== undefined) return false
  if (target.targetId === seedId) return target.openerId === undefined
  return admitPopup && target.openerId === seedId && seedReady
}

export async function startTargetGate(options: Options) {
  const transport = await launchTargetTransport(options.headless)
  const seed = deferred<string>()
  const targets = new Map<string, { target: Target; ready: boolean }>()
  const decisions: Array<RequestFacts & { allowed: boolean }> = []
  const attachments: Array<{ targetId: string; type: string; paused: boolean; rejected: boolean }> = []
  const commands: Array<{ targetId: string; command: string }> = []
  let browserContextId = ''
  let terminal = false
  let closing: Promise<void> | undefined
  function revoke() {
    terminal = true
    seed.resolve('')
    closing ??= transport.close()
    return closing
  }
  transport.lost(() => {
    // The caller awaits revoke during teardown; observe background rejection here.
    void revoke().catch(() => undefined)
  })
  async function guard(sessionId: string, target: Target) {
    for (const [command, params] of [
      ['Target.setAutoAttach', autoAttach],
      ['Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }],
    ] as const) {
      if (terminal) return
      if (options.failCommand === command) throw new Error('Synthetic guard installation failure')
      await transport.send(command, params, sessionId)
      commands.push({ targetId: target.targetId, command })
    }
    await options.beforeTargetReady?.()
    if (terminal) return
    targets.get(sessionId)!.ready = true
    await transport.send('Runtime.runIfWaitingForDebugger', {}, sessionId)
    commands.push({ targetId: target.targetId, command: 'Runtime.runIfWaitingForDebugger' })
  }
  async function attach(event: Attachment) {
    const { sessionId } = event
    const { targetId, type, browserContextId: contextId, openerId, subtype } = event.targetInfo
    const target = { targetId, type, browserContextId: contextId, openerId, subtype }
    const duplicate = targets.has(sessionId) || [...targets.values()].some(entry => entry.target.targetId === targetId)
    if (terminal || !hasValidAttachmentScope(event, browserContextId) || duplicate) {
      await revoke()
      return
    }
    targets.set(sessionId, { target, ready: false })
    const seedId = await seed.promise
    const seedReady = [...targets.values()].some(entry => entry.target.targetId === seedId && entry.ready)
    const rejected = terminal || !eligiblePage(target, seedId, seedReady, options.admitDirectPopup === true)
    attachments.push({ targetId, type, paused: true, rejected: Boolean(rejected) })
    if (rejected) {
      await revoke()
      return
    }
    await guard(sessionId, target)
  }
  async function pause(event: Pause, sessionId: string) {
    const entry = targets.get(sessionId)
    if (!entry?.ready || terminal) {
      await revoke()
      return
    }
    const facts = {
      url: event.request.url,
      method: event.request.method,
      resourceType: event.resourceType,
      targetId: entry.target.targetId,
    }
    const allowed = options.allow(facts)
    decisions.push({ ...facts, allowed })
    if (!allowed) {
      terminal = true
      await transport.send(
        'Fetch.failRequest',
        { requestId: event.requestId, errorReason: 'BlockedByClient' },
        sessionId,
      )
      await revoke()
      return
    }
    if (terminal) return
    await transport.send('Fetch.continueRequest', { requestId: event.requestId }, sessionId)
  }
  transport.events(event => {
    let work: Promise<void> | undefined
    if (event.method === 'Target.attachedToTarget') work = attach(event.params as unknown as Attachment)
    else if (event.method === 'Fetch.requestPaused')
      work = pause(event.params as unknown as Pause, event.sessionId ?? '')
    else if (event.method === 'Target.detachedFromTarget' && !terminal) work = revoke()
    if (work) void work.catch(() => revoke()).catch(() => undefined)
  })
  function sessionFor(targetId: string) {
    const session = [...targets.entries()].find(([, entry]) => entry.target.targetId === targetId && entry.ready)?.[0]
    if (!session || terminal) throw new Error('Synthetic target is not ready')
    return session
  }
  try {
    const context = await transport.send<{ browserContextId: string }>('Target.createBrowserContext', {
      disposeOnDetach: true,
    })
    browserContextId = context.browserContextId
    await transport.send('Browser.setDownloadBehavior', { behavior: 'deny', browserContextId })
    await transport.send('Target.setAutoAttach', autoAttach)
    const { targetId } = await transport.send<{ targetId: string }>('Target.createTarget', {
      url: 'about:blank',
      browserContextId,
    })
    seed.resolve(targetId)
    return {
      targetId,
      profileDirectory: transport.profileDirectory,
      executableName: transport.executableName,
      targets,
      decisions,
      attachments,
      commands,
      revoke,
      exited: transport.exited,
      breakPipe: transport.breakPipe,
      async evaluate(expression: string, id = targetId) {
        const result = await transport.send<{ result: { value?: unknown }; exceptionDetails?: unknown }>(
          'Runtime.evaluate',
          { expression, awaitPromise: true, returnByValue: true },
          sessionFor(id),
        )
        if (result.exceptionDetails) throw new Error('Synthetic page evaluation failed')
        return result.result.value
      },
      navigate(url: string) {
        return transport.send('Page.navigate', { url }, sessionFor(targetId))
      },
      detachSeed() {
        return transport.send('Target.detachFromTarget', { sessionId: sessionFor(targetId) })
      },
    }
  } catch (error) {
    await revoke()
    throw error
  }
}
