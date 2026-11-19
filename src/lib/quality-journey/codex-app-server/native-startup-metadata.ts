import schema from './native-qualification-schemas/ServerNotification.json'

export const nativeStartupPolicyIdentity = 'M13_ORIGINAL_NATIVE_STARTUP_METADATA_V2'
export const nativeStartupWarning =
  '`[features].multi_agent` is deprecated. It still controls the V1 fallback. `[agents].enabled = false` disables subagent tools even when the model selects a subagent version, unless `[features].multi_agent_v2` is enabled.'
const plans: readonly string[] = schema.definitions.PlanType.enum
const refusal = () => new Error('Original native startup metadata refused')

/** Finite startup state only; callers cannot import a receipt, select categories or reopen it. */
export class NativeStartupMetadata {
  #open = false
  #closed = false
  #initialized = false
  #configuration = false
  #warning = false
  #account = false
  #waiting = false
  #deadline?: number
  #wake?: () => void
  #reject?: (error: Error) => void

  close() {
    this.#closed = true
    this.#open = false
    this.#reject?.(refusal())
  }
  #refuse(): never {
    this.close()
    throw refusal()
  }
  /** Called solely by the original passive parser after correlation and whole-frame validation. */
  validatedInitialize() {
    if (this.#closed || this.#open) this.#refuse()
    this.#open = true
  }
  /** Original initialization Promise settlement finalizes provisional same-chunk observations. */
  settledInitialize() {
    if (!this.#open || this.#closed || this.#initialized) this.#refuse()
    this.#initialized = true
    this.#wake?.()
  }
  verifiedConfiguration() {
    if (!this.#open || this.#closed || this.#configuration) this.#refuse()
    this.#configuration = true
    this.#wake?.()
  }
  #warningSnapshot(params: Record<string, unknown>) {
    if (
      this.#warning ||
      Object.keys(params).some(key => !['summary', 'details', 'path', 'range'].includes(key)) ||
      params.summary !== nativeStartupWarning ||
      ['details', 'path', 'range'].some(key => params[key] != null)
    )
      this.#refuse()
    this.#warning = true
  }
  #planPresence(params: Record<string, unknown>) {
    // Accepted D3 binds schema-value presence only, never account identity or a retained plan value.
    if (!Object.hasOwn(params, 'planType') || typeof params.planType !== 'string' || !plans.includes(params.planType))
      this.#refuse()
  }
  #accountSnapshot(params: Record<string, unknown>) {
    if (
      this.#account ||
      Object.keys(params).some(key => !['authMode', 'planType'].includes(key)) ||
      !Object.hasOwn(params, 'authMode') ||
      params.authMode !== 'chatgpt'
    )
      this.#refuse()
    this.#planPresence(params)
    this.#account = true
  }
  notification(method: 'configWarning' | 'account/updated', params: Record<string, unknown>) {
    if (!this.#open || this.#closed) this.#refuse()
    if (method === 'configWarning') this.#warningSnapshot(params)
    else this.#accountSnapshot(params)
    this.#wake?.()
  }
  #ready() {
    return this.#open && !this.#closed && this.#initialized && this.#configuration && this.#warning && this.#account
  }
  /** Absolute original deadline only. Arrival/configuration never resets the remaining time. */
  async wait(deadline: number, signal?: AbortSignal) {
    if (this.#waiting || this.#closed || !Number.isSafeInteger(deadline) || deadline <= Date.now() || signal?.aborted)
      this.#refuse()
    this.#waiting = true
    this.#deadline = deadline
    if (this.#ready()) return
    await new Promise<void>((resolve, reject) => {
      const abort = () => this.close()
      const timer = setTimeout(abort, Math.max(0, deadline - Date.now()))
      const clear = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        this.#wake = undefined
        this.#reject = undefined
      }
      this.#reject = error => {
        clear()
        reject(error)
      }
      this.#wake = () => {
        if (!this.#ready()) return
        if (Date.now() >= deadline || signal?.aborted) return this.close()
        clear()
        resolve()
      }
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
    })
  }
  assertReady() {
    if (!this.#waiting || !this.#ready() || !this.#deadline || Date.now() >= this.#deadline) this.#refuse()
  }
  /** Synchronous final check and irreversible closure at original wire admission. */
  admit() {
    this.assertReady()
    this.close()
  }
}
