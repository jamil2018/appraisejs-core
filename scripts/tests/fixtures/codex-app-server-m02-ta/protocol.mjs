import { JsonLines, line } from '../codex-app-server-m02-b1/framing.mjs'
import { casePolicy, digest } from './policy.mjs'

/** Bounded app-server peer. write is injected; no FD, process or listener is opened. */
export class TrustedAppServerPeer {
  #coordinator
  #journal
  #write
  #case
  #pending = null
  #phase = 'new'
  #thread = null
  #turn = null
  #frames = new JsonLines()
  #seen = new Set()
  #verifyRequiredFailure
  #mcpStartId
  #verifyMcpStartup
  #threadParams
  #verifyCaptureTerminal
  constructor({
    coordinator,
    journal,
    write,
    caseId,
    verifyRequiredMcpFailure = () => false,
    verifyMcpStartup = () => false,
    threadStartParams = null,
    verifyCaptureTerminal = () => false,
  }) {
    this.#case = casePolicy(caseId)
    this.#verifyRequiredFailure = verifyRequiredMcpFailure
    this.#mcpStartId = journal.snapshot().pending.find(entry => entry.kind === 'mcpStarts')?.id ?? null
    this.#verifyMcpStartup = verifyMcpStartup
    this.#threadParams = structuredClone(threadStartParams)
    this.#verifyCaptureTerminal = verifyCaptureTerminal
    if (!coordinator || !journal || typeof write !== 'function') throw new Error('injected peer ports required')
    this.#coordinator = coordinator
    this.#journal = journal
    this.#write = write
  }
  async #fence() {
    try {
      if (!this.#journal.snapshot().fenced) await this.#journal.markUnknown()
    } catch {
      /* retain existing UNKNOWN */
    }
    throw new Error('protocol UNKNOWN; never resend')
  }
  async request(method, params, id) {
    try {
      if (this.#pending || this.#seen.has(id) || !/^[A-Za-z0-9._:-]{1,128}$/.test(id ?? '')) return await this.#fence()
      if (!(
        (method === 'initialize' && this.#phase === 'new') ||
        (method === 'thread/start' && this.#phase === 'ready') ||
        (method === 'turn/start' &&
          this.#phase === 'thread' &&
          this.#case.id !== 'P00' &&
          params?.threadId === this.#thread)
      ))
        return await this.#fence()
      if (method === 'thread/start' && this.#threadParams && digest(params) !== digest(this.#threadParams))
        return await this.#fence()
      this.#seen.add(id)
      this.#pending = { method, id }
      return await this.#coordinator.perform(
        method === 'initialize' ? 'controlWrites' : method === 'thread/start' ? 'threadStarts' : 'turnStarts',
        id,
        async reservation => {
          const bytes = line({ id, method, params })
          if ((await this.#write(bytes, reservation)) !== bytes.length) throw new Error('partial stdio send')
          return { sent: true, acknowledged: false, id }
        },
      )
    } catch {
      return this.#fence()
    }
  }
  async feed(bytes) {
    try {
      if (this.#journal.snapshot().fenced) return await this.#fence()
      for (const frame of this.#frames.feed(bytes)) {
        if ('id' in frame && !('method' in frame)) {
          const pending = this.#pending
          if (!pending || frame.id !== pending.id || 'result' in frame === 'error' in frame) return await this.#fence()
          if ('error' in frame) {
            if (
              this.#case.id === 'P00' &&
              pending.method === 'thread/start' &&
              Number.isInteger(frame.error?.code) &&
              this.#verifyRequiredFailure(frame.error) === true
            ) {
              if (this.#mcpStartId) {
                await this.#journal.acknowledge(this.#mcpStartId)
                this.#mcpStartId = null
              }
              await this.#journal.acknowledge(frame.id)
              this.#pending = null
              this.#phase = 'required-mcp-failed'
              continue
            }
            return await this.#fence()
          }
          if (pending.method === 'initialize') {
            if (typeof frame.result?.userAgent !== 'string') return await this.#fence()
            await this.#journal.acknowledge(frame.id)
            this.#pending = null
            await this.#coordinator.perform('controlWrites', `${frame.id}-initialized`, async reservation => {
              const data = line({ method: 'initialized' })
              if ((await this.#write(data, reservation)) !== data.length)
                throw new Error('partial initialized notification')
            })
            this.#phase = 'ready'
          } else {
            const key = pending.method === 'thread/start' ? 'thread' : 'turn'
            const value = frame.result?.[key]?.id
            if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(value)) return await this.#fence()
            if (key === 'thread') {
              if (this.#mcpStartId) {
                if (!(await this.#verifyMcpStartup(frame.result))) return await this.#fence()
                await this.#journal.acknowledge(this.#mcpStartId)
                this.#mcpStartId = null
              }
              if (this.#thread !== null && this.#thread !== value) return await this.#fence()
              this.#thread = value
            } else {
              if (this.#turn !== null && this.#turn !== value) return await this.#fence()
              this.#turn = value
            }
            await this.#journal.acknowledge(frame.id)
            this.#pending = null
            this.#phase = key
          }
        } else if (frame.method === 'item/permissions/requestApproval' && 'id' in frame && this.#case.id === 'B14') {
          await this.#coordinator.denyPermission({
            requestId: frame.id,
            threadId: frame.params?.threadId,
            expectedThreadId: this.#thread,
            turnId: frame.params?.turnId,
            expectedTurnId: this.#turn,
            send: async (reply, reservation) => {
              const data = line(reply)
              if ((await this.#write(data, reservation)) !== data.length) throw new Error('partial denial')
            },
          })
          this.#phase = 'permission-denied'
        } else if (
          !('id' in frame) &&
          [
            'turn/started',
            'item/started',
            'item/completed',
            'item/agentMessage/delta',
            'item/reasoning/textDelta',
            'item/reasoning/summaryTextDelta',
            'item/commandExecution/outputDelta',
            'thread/tokenUsage/updated',
            'thread/status/changed',
          ].includes(frame.method)
        ) {
          const thread = frame.params?.threadId
          const turn = frame.params?.turnId ?? frame.params?.turn?.id
          if (thread !== this.#thread || (turn !== undefined && this.#turn !== null && turn !== this.#turn))
            return await this.#fence()
          if (frame.method === 'turn/started' && this.#turn === null) {
            if (this.#pending?.method !== 'turn/start' || typeof turn !== 'string') return await this.#fence()
            this.#turn = turn
          }
          // Text/output is intentionally discarded, never acceptance or persisted evidence.
        } else if (!('id' in frame) && frame.method === 'thread/started') {
          if (this.#pending?.method !== 'thread/start' && this.#phase !== 'thread') return await this.#fence()
          const thread = frame.params?.thread?.id
          if (typeof thread !== 'string' || (this.#thread !== null && thread !== this.#thread))
            return await this.#fence()
          this.#thread = thread
        } else if (frame.method === 'turn/completed' && !('id' in frame)) {
          if (
            this.#phase !== 'turn' ||
            frame.params?.threadId !== this.#thread ||
            frame.params?.turn?.id !== this.#turn ||
            !(
              frame.params?.turn?.status === 'completed' ||
              (this.#case.id === 'T1' &&
                frame.params?.turn?.status === 'failed' &&
                this.#verifyCaptureTerminal() === true)
            )
          )
            return await this.#fence()
          this.#phase = frame.params.turn.status === 'completed' ? 'terminal' : 'capture-stopped'
        } else {
          // Exact additional notification/request methods need a reviewed classifier, not silent discard.
          return await this.#fence()
        }
      }
    } catch {
      return this.#fence()
    }
  }
  async eof() {
    try {
      this.#frames.eof()
    } catch {
      return this.#fence()
    }
    if (
      this.#pending ||
      !['terminal', 'required-mcp-failed', 'permission-denied', 'capture-stopped'].includes(this.#phase)
    )
      return this.#fence()
  }
  snapshot() {
    return {
      phase: this.#phase,
      pending: this.#pending?.id ?? null,
      threadId: this.#thread,
      turnId: this.#turn,
      runtimeQualified: false,
    }
  }
}
