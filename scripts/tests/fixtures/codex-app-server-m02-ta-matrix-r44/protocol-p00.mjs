import { line } from '../codex-app-server-m02-b1/framing.mjs'
import { CountedJsonLines } from './framing.mjs'
import { createHash } from 'node:crypto'
import { casePolicy, digest } from './policy.mjs'
import { createPermissionDiagnostic, permissionRequestFailure } from './permission-request-diagnostic.mjs'
import { threadReadStateFailure } from './thread-read-state.mjs'
import { inspectNotificationEnvelope } from '../codex-app-server-m02-ta-runtime-r9/notification-envelope.mjs'
import { isPassiveRateLimitsParams } from '../codex-app-server-m02-ta-passive-telemetry-r13/rate-limit-advisory.mjs'

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const only = (value, fields) => record(value) && Object.keys(value).every(key => fields.includes(key))
const nullableString = value => value === undefined || value === null || typeof value === 'string'
const textPosition = value =>
  only(value, ['line', 'column']) &&
  Number.isSafeInteger(value.line) &&
  value.line >= 0 &&
  Number.isSafeInteger(value.column) &&
  value.column >= 0
const textRange = value => only(value, ['start', 'end']) && textPosition(value.start) && textPosition(value.end)
const telemetryKinds = new Set([
  'mcpServer/startupStatus/updated',
  'warning',
  'configWarning',
  'deprecationNotice',
  'account/updated',
  'account/rateLimits/updated',
  'thread/readState/changed',
  'remoteControl/status/changed',
  'skills/changed',
])
export const PROTOCOL_FAILURE_CATEGORIES = Object.freeze([
  'UNCLASSIFIED_PROTOCOL',
  'UNKNOWN_NOTIFICATION',
  'UNKNOWN_REQUEST_OR_NOTIFICATION',
  'THREAD_PARAMETERS_MISSING',
  'TELEMETRY_QUOTA',
  'MCP_STARTUP_MALFORMED_OR_FOREIGN',
  'MCP_STARTUP_FOREIGN_THREAD',
  'MCP_STARTUP_FAILED',
  'MCP_STARTUP_INCONSISTENT',
  'PRESENTATION_MALFORMED',
  'PRESENTATION_FOREIGN_THREAD',
  'UNEXPECTED_AUTH_STATE',
  'RATE_LIMIT_ADVISORY_INVALID',
  'THREAD_READ_STATE_INVALID',
  'STREAM_EOF_OR_PARTIAL',
  'FEED_OR_FRAME_ERROR',
  'REQUEST_SEND_ERROR',
  'OWNED_CHILD_OR_STREAM_ERROR',
  'OWNED_EFFECT_UNCERTAIN',
  'MIXED_FRAME_FIELDS',
  'REMOTE_CONTROL_MALFORMED',
  'REMOTE_CONTROL_NOT_DISABLED',
  'SKILLS_CHANGED_MALFORMED',
  'NOTIFICATION_ENVELOPE_INVALID',
  'PERMISSION_REQUEST_INVALID',
  'PERMISSION_RESOLUTION_INVALID',
  'PERMISSION_TERMINAL_INVALID',
])

/** Bounded app-server peer. write is injected; no FD, process or listener is opened. */
export class TrustedMatrixAppServerPeer {
  #coordinator
  #journal
  #write
  #case
  #pending = null
  #phase = 'new'
  #thread = null
  #provisionalThread = null
  #turn = null
  #frames = new CountedJsonLines()
  #seen = new Set()
  #verifyRequiredFailure
  #mcpStartId
  #verifyMcpStartup
  #threadParams
  #verifyCaptureTerminal
  #onFailure
  #failureRecorded = false
  #telemetryCount = 0
  #telemetryBytes = 0
  #frameKind = 'invalid'
  #safeRemoteStatus = null
  #remoteHasEnvironment = false
  #currentMethod = null
  #timestampPresent = false
  #envelopeFailureReason = null
  #permissionRequest = null
  #permissionDiagnostic = null
  #threadReadStateFailureReason = null
  #verifyPermissionRequest
  #verifyPermissionTerminal
  #verifyRequiredMcpTelemetry
  #mcpFailureObserved = false
  constructor({
    coordinator,
    journal,
    write,
    caseId,
    verifyRequiredMcpFailure = null,
    verifyRequiredMcpTelemetry = null,
    verifyMcpStartup = () => false,
    threadStartParams = null,
    verifyCaptureTerminal = () => false,
    verifyPermissionRequest = null,
    verifyPermissionTerminal = null,
    onFailure = () => {},
  }) {
    this.#case = casePolicy(caseId)
    if (
      this.#case.id === 'P00' &&
      (typeof verifyRequiredMcpTelemetry !== 'function' || typeof verifyRequiredMcpFailure !== 'function')
    )
      throw new Error('P00 failed-startup telemetry and RPC verifiers required')
    if (
      this.#case.id === 'B14' &&
      (typeof verifyPermissionRequest !== 'function' || typeof verifyPermissionTerminal !== 'function')
    )
      throw new Error('B14 permission request and terminal verifiers required')
    this.#verifyRequiredFailure = verifyRequiredMcpFailure
    this.#verifyRequiredMcpTelemetry = verifyRequiredMcpTelemetry
    this.#mcpStartId = journal.snapshot().pending.find(entry => entry.kind === 'mcpStarts')?.id ?? null
    this.#verifyMcpStartup = verifyMcpStartup
    this.#threadParams = structuredClone(threadStartParams)
    this.#verifyCaptureTerminal = verifyCaptureTerminal
    this.#verifyPermissionRequest = verifyPermissionRequest
    this.#verifyPermissionTerminal = verifyPermissionTerminal
    this.#onFailure = onFailure
    if (!coordinator || !journal || typeof write !== 'function') throw new Error('injected peer ports required')
    this.#coordinator = coordinator
    this.#journal = journal
    this.#write = write
  }
  async #fence(category = 'UNCLASSIFIED_PROTOCOL', method = null) {
    if (!this.#failureRecorded && !this.#journal.snapshot().fenced) {
      this.#failureRecorded = true
      try {
        await this.#onFailure({
          category,
          phase: this.#phase,
          pendingKind: this.#pending?.method ?? null,
          seq: this.#journal.snapshot().seq ?? null,
          methodSha256:
            typeof (method ?? this.#currentMethod) === 'string'
              ? createHash('sha256')
                  .update(method ?? this.#currentMethod)
                  .digest('hex')
              : null,
          frameKind: this.#frameKind,
          safeRemoteStatus: this.#safeRemoteStatus,
          hasEnvironment: this.#remoteHasEnvironment,
          envelopeFailureReason: this.#envelopeFailureReason,
          timestampPresent: this.#timestampPresent,
          permissionDiagnostic: this.#case.id === 'B14' ? this.#permissionDiagnostic : null,
          threadReadStateFailureReason: this.#threadReadStateFailureReason,
        })
      } catch {
        /* The durable UNKNOWN journal remains authoritative if a diagnostic cannot be stored. */
      }
    }
    try {
      if (!this.#journal.snapshot().fenced) await this.#journal.markUnknown()
    } catch {
      /* retain existing UNKNOWN */
    }
    throw new Error('protocol UNKNOWN; never resend')
  }
  async #telemetry(frame, originalByteCount) {
    const method = frame.method
    if (!telemetryKinds.has(method)) return this.#fence('UNKNOWN_NOTIFICATION')
    this.#telemetryCount++
    this.#telemetryBytes += originalByteCount
    if (this.#telemetryCount > 32 || this.#telemetryBytes > 16 * 1024) return this.#fence('TELEMETRY_QUOTA')
    const params = frame.params
    if (method === 'thread/readState/changed') {
      const reason = threadReadStateFailure(params, {
        phase: this.#phase,
        threadId: this.#thread,
        turnId: this.#turn,
      })
      if (reason !== null) {
        this.#threadReadStateFailureReason ??= reason
        return this.#fence('THREAD_READ_STATE_INVALID', method)
      }
      // Presentation-only: discard revision and position without changing any owned lifecycle state.
      return
    }
    if (method === 'account/rateLimits/updated') {
      const campaign = this.#journal.snapshot()
      if (
        this.#phase !== 'turn' ||
        this.#pending !== null ||
        this.#thread === null ||
        this.#turn === null ||
        campaign.activeCase !== this.#case.id ||
        campaign.fenced ||
        campaign.pending.some(entry => ['threadStarts', 'turnStarts'].includes(entry.kind)) ||
        !isPassiveRateLimitsParams(params)
      )
        return this.#fence('RATE_LIMIT_ADVISORY_INVALID', method)
      // Presentation-only telemetry. No account value, spend conclusion, or authority is retained.
      return
    }
    if (method === 'remoteControl/status/changed') {
      this.#safeRemoteStatus = ['disabled', 'connecting', 'connected', 'errored'].includes(params?.status)
        ? params.status
        : 'OTHER'
      this.#remoteHasEnvironment = params?.environmentId != null
      if (
        !only(params, ['status', 'environmentId', 'installationId', 'serverName']) ||
        typeof params.installationId !== 'string' ||
        typeof params.serverName !== 'string' ||
        !['disabled', 'connecting', 'connected', 'errored'].includes(params.status) ||
        !nullableString(params.environmentId)
      )
        return this.#fence('REMOTE_CONTROL_MALFORMED', method)
      if (params.status !== 'disabled' || params.environmentId != null)
        return this.#fence('REMOTE_CONTROL_NOT_DISABLED', method)
      return
    }
    if (method === 'skills/changed') {
      if (!only(params, [])) return this.#fence('SKILLS_CHANGED_MALFORMED', method)
      return
    }
    if (method === 'mcpServer/startupStatus/updated') {
      if (this.#case.id === 'P00' && this.#mcpFailureObserved) return this.#fence('MCP_STARTUP_INCONSISTENT', method)
      if (
        !only(params, ['name', 'status', 'threadId', 'error', 'failureReason']) ||
        params.name !== 'appraise_m02' ||
        !['starting', 'ready', 'failed', 'cancelled'].includes(params.status) ||
        !nullableString(params.threadId) ||
        !nullableString(params.error) ||
        ![undefined, null, 'reauthenticationRequired'].includes(params.failureReason)
      )
        return this.#fence('MCP_STARTUP_MALFORMED_OR_FOREIGN')
      if (this.#case.id === 'P00' && params.status === 'ready') return this.#fence('MCP_STARTUP_INCONSISTENT', method)
      if (params.threadId != null) {
        if (!/^[A-Za-z0-9._:-]{1,200}$/.test(params.threadId)) return this.#fence('MCP_STARTUP_MALFORMED_OR_FOREIGN')
        if (this.#thread !== null) {
          if (params.threadId !== this.#thread) return this.#fence('MCP_STARTUP_FOREIGN_THREAD')
        } else {
          const pending = this.#pending
          if (
            pending?.method !== 'thread/start' ||
            !this.#journal.snapshot().pending.some(entry => entry.kind === 'threadStarts' && entry.id === pending.id) ||
            (this.#provisionalThread !== null && this.#provisionalThread !== params.threadId)
          )
            return this.#fence('MCP_STARTUP_FOREIGN_THREAD')
          this.#provisionalThread = params.threadId
        }
      }
      if (params.status === 'failed') {
        if (
          this.#case.id !== 'P00' ||
          this.#phase !== 'ready' ||
          this.#pending?.method !== 'thread/start' ||
          !this.#mcpStartId ||
          !this.#journal
            .snapshot()
            .pending.some(entry => entry.kind === 'mcpStarts' && entry.id === this.#mcpStartId) ||
          !this.#journal
            .snapshot()
            .pending.some(entry => entry.kind === 'threadStarts' && entry.id === this.#pending.id) ||
          bytes > 4096 ||
          (typeof params.error === 'string' && Buffer.byteLength(params.error) > 4096) ||
          params.failureReason != null ||
          (await this.#verifyRequiredMcpTelemetry(params, {
            caseId: 'P00',
            threadStartId: this.#pending.id,
            provisionalThreadId: this.#provisionalThread,
          })) !== true
        )
          return this.#fence('MCP_STARTUP_FAILED', method)
        this.#mcpFailureObserved = true
        return
      }
      if (params.status === 'cancelled') return this.#fence('MCP_STARTUP_FAILED')
      if (params.error != null || params.failureReason != null) return this.#fence('MCP_STARTUP_INCONSISTENT')
      return
    }
    if (method === 'warning') {
      if (
        !only(params, ['message', 'threadId']) ||
        typeof params.message !== 'string' ||
        !nullableString(params.threadId)
      )
        return this.#fence('PRESENTATION_MALFORMED')
      if (params.threadId != null && params.threadId !== this.#thread) return this.#fence('PRESENTATION_FOREIGN_THREAD')
      return
    }
    if (method === 'configWarning') {
      if (
        !only(params, ['summary', 'details', 'path', 'range']) ||
        typeof params.summary !== 'string' ||
        !nullableString(params.details) ||
        !nullableString(params.path) ||
        !(params.range === undefined || params.range === null || textRange(params.range))
      )
        return this.#fence('PRESENTATION_MALFORMED')
      return
    }
    if (method === 'deprecationNotice') {
      if (
        !only(params, ['summary', 'details']) ||
        typeof params.summary !== 'string' ||
        !nullableString(params.details)
      )
        return this.#fence('PRESENTATION_MALFORMED')
      return
    }
    if (!only(params, ['authMode', 'planType'])) return this.#fence('PRESENTATION_MALFORMED')
    if (params.authMode != null || params.planType != null) return this.#fence('UNEXPECTED_AUTH_STATE')
  }
  async request(method, params, id) {
    this.#frameKind = 'request'
    this.#safeRemoteStatus = null
    this.#remoteHasEnvironment = false
    this.#currentMethod = typeof method === 'string' ? method : null
    this.#timestampPresent = false
    this.#envelopeFailureReason = null
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
      return this.#fence('REQUEST_SEND_ERROR')
    }
  }
  async feed(bytes) {
    this.#frameKind = 'invalid'
    this.#safeRemoteStatus = null
    this.#remoteHasEnvironment = false
    this.#currentMethod = null
    this.#timestampPresent = false
    this.#envelopeFailureReason = null
    try {
      if (this.#journal.snapshot().fenced) return await this.#fence()
      for (const { frame, originalByteCount } of this.#frames.feed(bytes)) {
        this.#frameKind =
          'id' in frame && 'method' in frame
            ? 'invalid'
            : 'id' in frame
              ? 'response'
              : 'method' in frame
                ? 'notification'
                : 'invalid'
        this.#safeRemoteStatus = null
        this.#remoteHasEnvironment = false
        this.#currentMethod = typeof frame.method === 'string' ? frame.method : null
        this.#timestampPresent = Object.hasOwn(frame, 'emittedAtMs')
        this.#envelopeFailureReason = null
        if ('id' in frame && 'method' in frame && !('result' in frame) && !('error' in frame))
          this.#frameKind = 'request'
        if (!('id' in frame)) {
          const envelope = inspectNotificationEnvelope(frame)
          if (!envelope.ok) {
            this.#envelopeFailureReason = envelope.reason
            return await this.#fence('NOTIFICATION_ENVELOPE_INVALID')
          }
        }
        if ('method' in frame && ('result' in frame || 'error' in frame))
          return await this.#fence('MIXED_FRAME_FIELDS', frame.method)
        if ('id' in frame && !('method' in frame)) {
          const pending = this.#pending
          if (!pending || frame.id !== pending.id || 'result' in frame === 'error' in frame) return await this.#fence()
          if ('error' in frame) {
            if (
              this.#case.id === 'P00' &&
              pending.method === 'thread/start' &&
              this.#mcpStartId !== null &&
              this.#journal
                .snapshot()
                .pending.some(entry => entry.kind === 'mcpStarts' && entry.id === this.#mcpStartId) &&
              frame.error?.code === -32603 &&
              frame.error?.data == null &&
              (await this.#verifyRequiredFailure(frame.error, {
                caseId: 'P00',
                threadStartId: pending.id,
                provisionalThreadId: this.#provisionalThread,
                failedTelemetryObserved: this.#mcpFailureObserved,
              })) === true
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
            // The initialized write has completed and the coordinator is idle. Reserve and send
            // thread/start in this response continuation before another stdout frame is processed.
            if (!this.#threadParams) return await this.#fence('THREAD_PARAMETERS_MISSING')
            await this.request('thread/start', this.#threadParams, `${this.#case.id}-thread-start`)
          } else {
            if (this.#case.id === 'P00' && pending.method === 'thread/start')
              return await this.#fence('MCP_STARTUP_INCONSISTENT')
            const key = pending.method === 'thread/start' ? 'thread' : 'turn'
            const value = frame.result?.[key]?.id
            if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(value)) return await this.#fence()
            if (key === 'thread') {
              if (this.#thread !== null && this.#thread !== value) return await this.#fence()
              if (this.#provisionalThread !== null && this.#provisionalThread !== value)
                return await this.#fence('MCP_STARTUP_FOREIGN_THREAD')
              if (this.#mcpStartId) {
                if (!(await this.#verifyMcpStartup(frame.result))) return await this.#fence()
                await this.#journal.acknowledge(this.#mcpStartId)
                this.#mcpStartId = null
              }
              this.#thread = value
              this.#provisionalThread = null
            } else {
              if (this.#turn !== null && this.#turn !== value) return await this.#fence()
              this.#turn = value
            }
            await this.#journal.acknowledge(frame.id)
            this.#pending = null
            this.#phase = key
          }
        } else if (frame.method === 'item/permissions/requestApproval' && 'id' in frame && this.#case.id === 'B14') {
          const reason =
            this.#phase !== 'turn'
              ? 'PEER_PHASE_NOT_TURN'
              : this.#pending !== null
                ? 'PEER_RPC_PENDING'
                : this.#permissionRequest !== null
                  ? 'DUPLICATE_PERMISSION_REQUEST'
                  : permissionRequestFailure(frame, this.#thread, this.#turn)
          if (reason !== null) {
            this.#permissionDiagnostic ??= createPermissionDiagnostic(reason, frame, this.#thread, this.#turn)
            return await this.#fence('PERMISSION_REQUEST_INVALID', frame.method)
          }
          let verified
          try {
            verified = await this.#verifyPermissionRequest(frame, { threadId: this.#thread, turnId: this.#turn })
          } catch (error) {
            this.#permissionDiagnostic ??= createPermissionDiagnostic(
              'CALLER_VERIFIER_ERROR',
              frame,
              this.#thread,
              this.#turn,
            )
            throw error
          }
          if (verified !== true) {
            this.#permissionDiagnostic ??= createPermissionDiagnostic(
              'CALLER_VERIFIER_REJECTED',
              frame,
              this.#thread,
              this.#turn,
            )
            return await this.#fence('PERMISSION_REQUEST_INVALID', frame.method)
          }
          this.#permissionDiagnostic ??= createPermissionDiagnostic('ACCEPTED_SCHEMA', frame, this.#thread, this.#turn)
          this.#permissionRequest = { id: frame.id, itemId: frame.params.itemId, replied: false, resolved: false }
          await this.#coordinator.denyPermission({
            requestId: frame.id,
            threadId: frame.params.threadId,
            expectedThreadId: this.#thread,
            turnId: frame.params.turnId,
            expectedTurnId: this.#turn,
            send: async (reply, reservation) => {
              if (
                this.#permissionRequest.replied ||
                !only(reply, ['id', 'result']) ||
                reply.id !== frame.id ||
                !only(reply.result, ['permissions', 'scope']) ||
                !only(reply.result.permissions, []) ||
                reply.result.scope !== 'turn'
              )
                return await this.#fence('PERMISSION_REQUEST_INVALID', frame.method)
              const data = line(reply)
              if ((await this.#write(data, reservation)) !== data.length) throw new Error('partial denial')
              this.#permissionRequest.replied = true
            },
          })
          if (!this.#permissionRequest.replied) return await this.#fence('PERMISSION_REQUEST_INVALID', frame.method)
        } else if (frame.method === 'serverRequest/resolved' && !('id' in frame) && this.#case.id === 'B14') {
          if (
            this.#phase !== 'turn' ||
            !this.#permissionRequest?.replied ||
            this.#permissionRequest.resolved ||
            !only(frame.params, ['requestId', 'threadId']) ||
            frame.params.requestId !== this.#permissionRequest.id ||
            frame.params.threadId !== this.#thread
          )
            return await this.#fence('PERMISSION_RESOLUTION_INVALID', frame.method)
          this.#permissionRequest.resolved = true
        } else if (!('id' in frame) && telemetryKinds.has(frame.method)) {
          await this.#telemetry(frame, originalByteCount)
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
          if (this.#provisionalThread !== null && thread !== this.#provisionalThread)
            return await this.#fence('MCP_STARTUP_FOREIGN_THREAD')
          this.#thread = thread
        } else if (frame.method === 'turn/completed' && !('id' in frame)) {
          if (
            this.#case.id === 'B14' &&
            (!this.#permissionRequest?.replied ||
              !this.#permissionRequest.resolved ||
              (await this.#verifyPermissionTerminal(frame, {
                requestId: this.#permissionRequest.id,
                itemId: this.#permissionRequest.itemId,
                threadId: this.#thread,
                turnId: this.#turn,
              })) !== true)
          )
            return await this.#fence('PERMISSION_TERMINAL_INVALID', frame.method)
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
          return await this.#fence('UNKNOWN_REQUEST_OR_NOTIFICATION', frame.method)
        }
      }
    } catch {
      return this.#fence('FEED_OR_FRAME_ERROR')
    }
  }
  async eof() {
    this.#frameKind = 'invalid'
    this.#safeRemoteStatus = null
    this.#remoteHasEnvironment = false
    this.#currentMethod = null
    this.#timestampPresent = false
    this.#envelopeFailureReason = null
    try {
      this.#frames.eof()
    } catch {
      return this.#fence('STREAM_EOF_OR_PARTIAL')
    }
    if (
      this.#pending ||
      !['terminal', 'required-mcp-failed', 'capture-stopped'].includes(this.#phase) ||
      (this.#case.id === 'B14' && this.#phase !== 'terminal')
    )
      return this.#fence('STREAM_EOF_OR_PARTIAL')
  }
  snapshot() {
    return {
      phase: this.#phase,
      pending: this.#pending?.id ?? null,
      pendingKind: this.#pending?.method ?? null,
      threadId: this.#thread,
      turnId: this.#turn,
      mcpFailureObserved: this.#mcpFailureObserved,
      permissionRequestId: this.#permissionRequest?.id ?? null,
      permissionReplied: this.#permissionRequest?.replied ?? false,
      permissionResolved: this.#permissionRequest?.resolved ?? false,
      permissionDiagnostic: this.#case.id === 'B14' ? this.#permissionDiagnostic : null,
      runtimeQualified: false,
    }
  }
}
