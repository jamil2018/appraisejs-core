import type { RpcSenderManifest } from './rpc-transport'
import {
  canonicalNativeJson,
  nativeDigest,
  parseNativeMcpJson,
  validateNativeFrame,
  rpcDeliveredIdsDigest,
  rpcSenderSealDigest,
  NativeSourceError,
  nativeSourceBounds,
  type NativeSourceFrame,
} from './native-source-protocol'

type RawRecord = {
  rawSequence: number
  rawDigest: string
  bytes: number
  eventName: string
  responseId: string | null
  itemId: string | null
  callId: string | null
  final?: {
    eventName: string
    responseId: string | null
    itemId: string | null
    callId: string | null
    parseDisposition: string
  }
}
type Origin = {
  responseId: string
  itemId: string
  callId: string
  rawDigest: string
  bytes: number
  rawSequence: number
}
type Operation = {
  parent: string | null
  attempt: string
  transport: string
  thread: string | null
  turn: string | null
  call: string | null
  route: string
  entered: boolean
  closed: boolean
  maxBytes: number
  written: number
  pending?: { start: number; end: number; digest: string }
  mcp: boolean
  dispatched: boolean
  accepted: boolean
  raw?: { responseId: string; itemId: string; callId: string }
  origins: Record<string, Origin>
  records: Map<number, RawRecord>
  response: string | null
  mcpId?: NativeSourceFrame['mcpRequestId']
  requestHash?: string
}
/** Metadata graph only. Unrepresented lineage is UNKNOWN; completion events never imply provider finality. */
export class NativeRangeVerifier {
  #invalidated: () => boolean
  constructor(invalidated: () => boolean = () => false) {
    this.#invalidated = invalidated
  }
  #rpcManifest: RpcSenderManifest | undefined
  #rpcInputs: { requestId: number | null; start: number; end: number; rawDigest: string }[] = []
  #rpcWork = new Map<number, 'QUEUED' | 'DISPATCHED' | 'SETTLED' | 'NOT_DISPATCHED'>()
  #rpcIds = new Set<number>()
  #rpcEof = false
  #rpcOutputBytes = 0
  #rpcOutputOrdinal = 0
  #rpcOutputs: { requestId: number | null; start: number; end: number; rawDigest: string }[] = []
  #rpcOutputPending:
    | {
        ordinal: number
        start: number
        end: number
        rawDigest: string
        originalStart: number
        requestId: number | null
      }
    | undefined
  #operations = new Map<string, Operation>()
  #attempts = new Set<string>()
  #acceptanceIds = new Set<string>()
  #unknown = false
  #pendingParses = 0
  #rawSequences = new Set<number>()
  #sealed = false
  #frames = 0
  #nodes = 0
  #rawBytes = 0
  #requests = 0
  #fail(reason: string): never {
    this.#unknown = true
    throw new NativeSourceError(reason)
  }
  #operation(frame: NativeSourceFrame): Operation {
    const operation = frame.operationId ? this.#operations.get(frame.operationId) : undefined
    if (!operation || operation.closed) this.#fail('unreserved_or_closed_operation')
    this.#validateOperationLineage(frame, operation)
    return operation
  }
  captureRpcSenderManifest = (manifest: RpcSenderManifest): void => {
    if (this.#rpcManifest) this.#fail('duplicate_rpc_sender_manifest')
    if (manifest.allocations.length !== manifest.issuedRequests || manifest.allocations.some((a, i) => a.id !== i + 1))
      this.#fail('rpc_allocation_manifest')
    const { end, attempts } = this.#captureRpcAttempts(manifest)
    if (
      end !== manifest.attemptedBytes ||
      manifest.allocations.some(a => (a.state === 'ATTEMPTED') !== attempts.has(a.id))
    )
      this.#fail('rpc_manifest_coverage')
    this.#rpcManifest = manifest
    this.#verifyRpcInputs(false)
  }
  #verifyRpcInputs(final: boolean): void {
    const manifest = this.#rpcManifest
    if (!manifest) {
      if (final) this.#fail('rpc_sender_manifest_missing')
      return
    }
    for (let i = 0; i < this.#rpcInputs.length; i++)
      if (canonicalNativeJson(this.#rpcInputs[i]) !== canonicalNativeJson(manifest.attempts[i]))
        this.#fail('rpc_exact_input_mismatch')
    if (final) this.#verifyRpcInputCoverage(manifest)
  }
  #observeRpc(frame: NativeSourceFrame): void {
    this.#validateRpcFrame(frame)
    switch (frame.kind) {
      case 'RPC_INPUT':
        return this.#observeRpcInput(frame)
      case 'RPC_WORK':
        return this.#observeRpcWork(frame)
      case 'RPC_EOF':
        return this.#observeRpcEof(frame)
      case 'RPC_OUTPUT':
        return this.#observeRpcOutput(frame)
    }
  }
  /** Every path, including transient MCP and seal, validates final status before fast paths. */
  validateDisposition(frame: NativeSourceFrame): void {
    if (this.#sealed) this.#fail('range_frame_limit_or_sealed')
    try {
      validateNativeFrame(frame)
    } catch (error) {
      this.#unknown = true
      throw error
    }
    if (frame.disposition !== 'KNOWN' || ['UNKNOWN', 'FENCE', 'ADMISSION_POISON'].includes(frame.kind))
      this.#unknown = true
    if (['RAW_INPUT', 'PARSE_DISPOSITION', 'RPC_INPUT'].includes(frame.kind)) this.#validateParseDisposition(frame)
    if (['UNKNOWN', 'FENCE', 'ADMISSION_POISON'].includes(frame.kind) && frame.disposition !== 'UNKNOWN')
      this.#fail('contradictory_fault_disposition')
  }
  poisonAdmission(): void {
    this.#unknown = true
  }
  assertAdmission(): void {
    if (this.#unknown || this.#invalidated()) this.#fail('admission_poisoned')
  }
  observe(frame: NativeSourceFrame): void {
    this.validateDisposition(frame)
    if (frame.lane === 'MCP') return
    if (this.#sealed || ++this.#frames > nativeSourceBounds.frames) this.#fail('range_frame_limit_or_sealed')
    if (['RPC_INPUT', 'RPC_EOF', 'RPC_WORK', 'RPC_OUTPUT'].includes(frame.kind)) {
      this.#observeRpc(frame)
      return
    }
    this.#observeSource(frame)
  }
  bindMcpRequest(frame: NativeSourceFrame): void {
    this.validateDisposition(frame)
    this.assertAdmission()
    const message = parseNativeMcpJson(frame.payload.messageJson as string)
    const operation = this.#operation(frame)
    if (
      !('id' in message) ||
      canonicalNativeJson(frame.mcpRequestId) !== canonicalNativeJson(operation.mcpId ?? null) ||
      !operation.mcp ||
      operation.dispatched ||
      operation.requestHash !== nativeDigest(frame.payload.messageJson as string)
    )
      this.#fail('mcp_request_commitment_or_replay')
    operation.dispatched = true
  }
  seal(frame: NativeSourceFrame, previousHead: string): void {
    this.validateDisposition(frame)
    if (this.#pendingParses !== 0) this.#fail('incomplete_source_range')
    this.#validateRpcSealFacts(frame, this.#rpcManifestForSeal())
    if (
      frame.kind !== 'RANGE_SEAL' ||
      frame.payload.head !== previousHead ||
      frame.payload.operations !== this.#operations.size ||
      frame.payload.frames !== this.#frames ||
      this.#unknown ||
      this.#invalidated() ||
      [...this.#operations.values()].some(op => !op.closed)
    )
      this.#fail('incomplete_source_range')
    this.#sealed = true
  }
  snapshot() {
    return Object.freeze({
      rpcOutputRecords: Object.freeze(this.#rpcOutputs.map(record => Object.freeze({ ...record }))),
      rpcInputRecords: this.#rpcInputs.length,
      rpcObservedRequests: this.#rpcIds.size,
      rpcReceivedBytes: this.#rpcInputs.at(-1)?.end ?? 0,
      rpcEof: this.#rpcEof,
      operations: this.#operations.size,
      frames: this.#frames,
      nodes: this.#nodes,
      pendingParses: this.#pendingParses,
      admissionPoisoned: this.#unknown || this.#invalidated(),
      unknown: this.#unknown || this.#invalidated(),
      sealed: this.#sealed,
      issuedRequests: this.#requests,
      writtenBytes: [...this.#operations.values()].reduce((n, op) => n + op.written, 0),
      rawBytes: this.#rawBytes,
      graphDigest: canonicalNativeJson(
        [...this.#operations.entries()].map(([id, op]) => [
          id,
          {
            ...op,
            records: [...op.records],
            mcpId: op.mcpId ?? null,
            pending: op.pending ?? null,
            raw: op.raw ?? null,
            requestHash: op.requestHash ?? null,
          },
        ]),
      ),
    })
  }
  #validateOperationLineage(frame: NativeSourceFrame, operation: Operation): void {
    if (
      frame.parentOperationId !== operation.parent ||
      frame.attemptId !== operation.attempt ||
      frame.transportIncarnation !== operation.transport ||
      frame.nativeThreadId !== operation.thread ||
      frame.nativeTurnId !== operation.turn ||
      frame.sourceCallId !== operation.call
    )
      this.#fail('operation_lineage_changed')
  }
  #validateRpcFrame(frame: NativeSourceFrame): void {
    if (
      frame.operationId !== null ||
      frame.parentOperationId !== null ||
      frame.attemptId !== null ||
      frame.sourceCallId !== null ||
      frame.mcpRequestId !== null
    )
      this.#fail('rpc_intrinsic_correlation')
    if (++this.#nodes > nativeSourceBounds.nodes) this.#fail('rpc_node_capacity')
  }
  #validateRpcInput(frame: NativeSourceFrame): void {
    const p = frame.payload
    if (
      this.#rpcEof ||
      p.recordOrdinal !== this.#rpcInputs.length ||
      p.start !== (this.#rpcInputs.at(-1)?.end ?? 0) ||
      (p.end as number) <= (p.start as number)
    )
      this.#fail('rpc_input_framing_or_range')
    this.#validateRpcInputKind(frame)
  }
  #observeRpcInput(frame: NativeSourceFrame): void {
    const p = frame.payload
    this.#validateRpcInput(frame)
    if (p.messageKind === 'REQUEST') {
      if (frame.rpcRequestId === null || this.#rpcIds.has(frame.rpcRequestId)) this.#fail('rpc_actual_input_id')
      this.#rpcIds.add(frame.rpcRequestId)
    } else if (frame.rpcRequestId !== null) this.#fail('rpc_initialized_id')
    this.#rpcInputs.push({
      requestId: frame.rpcRequestId,
      start: p.start as number,
      end: p.end as number,
      rawDigest: p.rawDigest as string,
    })
    this.#verifyRpcInputs(false)
  }
  #observeRpcWork(frame: NativeSourceFrame): void {
    const p = frame.payload
    const ordinal = p.recordOrdinal as number,
      input = this.#rpcInputs[ordinal],
      old = this.#rpcWork.get(ordinal)
    if (p.state === 'DISPATCHED') this.assertAdmission()
    if (!input || input.requestId !== frame.rpcRequestId || !this.#validRpcTransition(old, p.state))
      this.#fail('rpc_work_transition')
    this.#rpcWork.set(ordinal, p.state as 'QUEUED' | 'DISPATCHED' | 'SETTLED' | 'NOT_DISPATCHED')
  }
  #observeRpcEof(frame: NativeSourceFrame): void {
    const p = frame.payload
    if (
      this.#rpcEof ||
      frame.rpcRequestId !== null ||
      p.receivedBytes !== (this.#rpcInputs.at(-1)?.end ?? 0) ||
      p.records !== this.#rpcInputs.length ||
      p.observedRequests !== this.#rpcIds.size ||
      p.observedIdsDigest !== rpcDeliveredIdsDigest([...this.#rpcIds])
    )
      this.#fail('rpc_eof_facts')
    this.#rpcEof = true
    this.#verifyRpcInputs(true)
  }
  #observeRpcOutput(frame: NativeSourceFrame): void {
    if (frame.payload.phase === 'ATTEMPT') this.#observeRpcOutputAttempt(frame)
    else this.#observeRpcOutputProgress(frame)
  }
  #observeRpcOutputAttempt(frame: NativeSourceFrame): void {
    const p = frame.payload
    if (
      this.#rpcOutputPending ||
      p.writeOrdinal !== this.#rpcOutputOrdinal ||
      p.start !== this.#rpcOutputBytes ||
      (p.end as number) <= (p.start as number)
    )
      this.#fail('rpc_output_attempt')
    this.#rpcOutputPending = {
      ordinal: p.writeOrdinal as number,
      start: p.start as number,
      end: p.end as number,
      rawDigest: p.rawDigest as string,
      originalStart: p.start as number,
      requestId: frame.rpcRequestId,
    }
  }
  #validateRpcOutputProgress(frame: NativeSourceFrame) {
    const p = frame.payload
    const pending = this.#rpcOutputPending
    if (
      !pending ||
      p.writeOrdinal !== pending.ordinal ||
      p.start !== pending.start ||
      (p.end as number) <= pending.start ||
      (p.end as number) > pending.end ||
      p.rawDigest !== pending.rawDigest
    )
      this.#fail('rpc_output_progress')
    return pending
  }
  #observeRpcOutputProgress(frame: NativeSourceFrame): void {
    const p = frame.payload
    const pending = this.#validateRpcOutputProgress(frame)
    this.#rpcOutputBytes = p.end as number
    if (p.end === pending.end) {
      this.#rpcOutputs.push({
        requestId: pending.requestId,
        start: pending.originalStart,
        end: pending.end,
        rawDigest: pending.rawDigest,
      })
      this.#rpcOutputPending = undefined
      this.#rpcOutputOrdinal++
    } else pending.start = p.end as number
  }
  #observeSource(frame: NativeSourceFrame): void {
    if (frame.disposition !== 'KNOWN') this.#unknown = true
    if (frame.kind === 'UNKNOWN' || frame.kind === 'FENCE') this.#unknown = true
    if (frame.kind === 'RESERVATION_DURABLE') return this.#reserveOperation(frame)
    if (
      ['HELLO', 'BOOTSTRAP', 'BOOTSTRAP_ACK', 'RESERVATION_ACK', 'RANGE_SEAL', 'MCP_REQUEST', 'MCP_REPLY'].includes(
        frame.kind,
      )
    )
      return
    if (['UNKNOWN', 'FENCE', 'ADMISSION_POISON'].includes(frame.kind)) return

    const operation = this.#operation(frame)
    this.#observeOperation(frame, operation)
  }
  #validateReservationIdentity(frame: NativeSourceFrame): void {
    const id = frame.operationId
    if (
      !id ||
      this.#operations.has(id) ||
      !frame.attemptId ||
      !frame.transportIncarnation ||
      this.#attempts.has(frame.attemptId) ||
      this.#operations.size >= nativeSourceBounds.operations ||
      [...this.#operations.values()].filter(op => !op.closed).length >= nativeSourceBounds.liveOperations ||
      ++this.#nodes > nativeSourceBounds.nodes
    )
      this.#fail('operation_capacity_identity_or_duplicate')
  }
  #validateReservationParent(frame: NativeSourceFrame): void {
    const p = frame.payload
    if (frame.parentOperationId !== null) {
      const parent = this.#operations.get(frame.parentOperationId)
      if (
        p.route !== 'appraise.mcp' ||
        !parent ||
        !['ws.direct', 'http.sse'].includes(parent.route) ||
        !parent.entered ||
        !frame.sourceCallId ||
        !parent.origins[frame.sourceCallId]
      )
        this.#fail('unsupported_retry_or_descendant_graph')
    }
  }
  #reserveOperation(frame: NativeSourceFrame): void {
    const id = frame.operationId,
      p = frame.payload

    this.assertAdmission()
    this.#validateReservationIdentity(frame)
    if (!['ws.direct', 'http.sse', 'appraise.mcp'].includes(frame.payload.route as string))
      this.#fail('unsupported_route')
    this.#validateReservationParent(frame)
    this.#attempts.add(frame.attemptId!)
    this.#operations.set(id!, {
      parent: frame.parentOperationId,
      attempt: frame.attemptId!,
      transport: frame.transportIncarnation!,
      thread: frame.nativeThreadId,
      turn: frame.nativeTurnId,
      call: frame.sourceCallId,
      route: p.route as string,
      entered: false,
      closed: false,
      maxBytes: p.maxBytes as number,
      written: 0,
      mcp: false,
      dispatched: false,
      accepted: false,
      origins: {},
      records: new Map(),
      response: null,
    })
    return
  }
  #observeOperation(frame: NativeSourceFrame, operation: Operation): void {
    switch (frame.kind) {
      case 'ATTEMPT_ENTERED':
        return this.#observeAttempt(frame, operation)
      case 'WRITE_ATTEMPT':
        return this.#observeWriteAttempt(frame, operation)
      case 'WRITE_PROGRESS':
        return this.#observeWriteProgress(frame, operation)
      case 'RAW_INPUT':
        return this.#observeRaw(frame, operation)
      case 'PARSE_DISPOSITION':
        return this.#observeParse(frame, operation)
      case 'MCP_CALL':
        return this.#observeMcpCall(frame, operation)
      case 'APPRAISE_ACCEPTANCE':
        return this.#observeAcceptance(frame, operation)
      case 'LOCAL_CLOSE':
        return this.#observeClose(frame, operation)
    }
  }
  #observeAttempt(frame: NativeSourceFrame, operation: Operation): void {
    const p = frame.payload
    this.assertAdmission()
    if (operation.entered || p.route !== operation.route) this.#fail('duplicate_or_foreign_attempt')
    operation.entered = true
  }
  #observeWriteAttempt(frame: NativeSourceFrame, operation: Operation): void {
    const p = frame.payload
    if (
      !operation.entered ||
      operation.pending ||
      p.start !== operation.written ||
      (p.end as number) <= (p.start as number) ||
      (p.end as number) > operation.maxBytes
    )
      this.#fail('write_attempt_range')
    operation.pending = { start: p.start as number, end: p.end as number, digest: p.rawDigest as string }
  }
  #observeWriteProgress(frame: NativeSourceFrame, operation: Operation): void {
    const p = frame.payload
    const pending = operation.pending
    if (
      !pending ||
      p.start !== pending.start ||
      (p.end as number) <= pending.start ||
      (p.end as number) > pending.end ||
      p.rawDigest !== pending.digest
    )
      this.#fail('write_progress_range')
    operation.written += (p.end as number) - pending.start
    if (p.end === pending.end) operation.pending = undefined
    else pending.start = p.end as number
  }
  #observeParentRaw(frame: NativeSourceFrame, operation: Operation, record: RawRecord): void {
    const p = frame.payload
    const original = record.callId && this.#operations.get(operation.parent!)?.origins[record.callId]
    const projected = {
      responseId: record.responseId,
      itemId: record.itemId,
      callId: record.callId,
      rawSequence: record.rawSequence,
      rawDigest: record.rawDigest,
      bytes: record.bytes,
    }
    if (
      p.parseDisposition !== 'KNOWN' ||
      !original ||
      canonicalNativeJson(original) !== canonicalNativeJson(projected) ||
      operation.raw
    )
      this.#fail('foreign_parent_raw_origin')
    if (++this.#nodes > nativeSourceBounds.nodes) this.#fail('raw_origin_node_capacity')
    operation.origins[original.callId] = original
    operation.raw = { responseId: original.responseId, itemId: original.itemId, callId: original.callId }
  }
  #observeOriginalRaw(frame: NativeSourceFrame, operation: Operation, record: RawRecord): void {
    const p = frame.payload
    if (
      operation.route === 'appraise.mcp' ||
      record.rawSequence !== frame.sequence ||
      this.#rawSequences.has(record.rawSequence)
    )
      this.#fail('raw_original_sequence_or_parent')
    if (++this.#nodes > nativeSourceBounds.nodes || this.#frames + this.#pendingParses + 2 > nativeSourceBounds.frames)
      this.#fail('raw_finalization_capacity')
    this.#rawSequences.add(record.rawSequence)
    this.#storeRawRecord(frame, operation, record)
    if (p.parseDisposition === 'PENDING') this.#pendingParses++
    else if (record.callId !== null && p.parseDisposition === 'KNOWN')
      this.#fail('callable_origin_requires_parser_completion')
  }
  #observeRaw(frame: NativeSourceFrame, operation: Operation): void {
    const p = frame.payload
    if (!operation.entered) this.#fail('raw_before_attempt')
    this.#rawBytes += p.bytes as number
    const record = p as unknown as RawRecord & { parseDisposition: string }

    if (operation.parent) this.#observeParentRaw(frame, operation, record)
    else this.#observeOriginalRaw(frame, operation, record)
  }
  #recordCallableOrigin(frame: NativeSourceFrame, operation: Operation, record: RawRecord): void {
    const p = frame.payload
    if (
      !operation.response ||
      p.responseId !== operation.response ||
      !p.itemId ||
      operation.origins[p.callId as string]
    )
      this.#fail('callable_parent_or_duplicate')
    if (++this.#nodes > nativeSourceBounds.nodes) this.#fail('raw_origin_node_capacity')
    operation.origins[p.callId as string] = {
      responseId: p.responseId as string,
      itemId: p.itemId as string,
      callId: p.callId as string,
      rawSequence: record.rawSequence,
      rawDigest: record.rawDigest,
      bytes: record.bytes,
    }
  }
  #completeKnownParse(frame: NativeSourceFrame, operation: Operation, record: RawRecord): void {
    const p = frame.payload
    if (p.eventName === 'response.created') this.#completeCreatedResponse(frame, operation, record)
    else this.#validateResponseContext(frame, operation, record)
    if (p.callId) this.#recordCallableOrigin(frame, operation, record)
  }
  #observeParse(frame: NativeSourceFrame, operation: Operation): void {
    const p = frame.payload
    const record = this.#retainedParseRecord(frame, operation)
    this.#validateProvisionalLineage(frame, record)
    if (p.parseDisposition !== 'KNOWN') {
      if (p.responseId !== record.responseId) this.#fail('fault_parse_lineage_changed')
    } else this.#completeKnownParse(frame, operation, record)
    record.final = {
      eventName: p.eventName as string,
      responseId: p.responseId as string | null,
      itemId: p.itemId as string | null,
      callId: p.callId as string | null,
      parseDisposition: p.parseDisposition as string,
    }
    this.#pendingParses--
  }
  #observeMcpCall(frame: NativeSourceFrame, operation: Operation): void {
    const p = frame.payload
    this.assertAdmission()
    if (
      operation.route !== 'appraise.mcp' ||
      operation.mcp ||
      !frame.sourceCallId ||
      !frame.mcpRequestId ||
      !operation.raw
    )
      this.#fail('mcp_call_original_raw_lineage')
    this.#validateMcpProjection(frame, operation.raw)
    operation.mcpId = Object.freeze({ ...frame.mcpRequestId! })
    operation.mcp = true
    operation.requestHash = p.requestHash as string
    this.#requests++
  }
  #observeAcceptance(frame: NativeSourceFrame, operation: Operation): void {
    const p = frame.payload
    if (
      canonicalNativeJson(frame.mcpRequestId) !== canonicalNativeJson(operation.mcpId ?? null) ||
      !operation.mcp ||
      !operation.dispatched ||
      operation.accepted ||
      this.#acceptanceIds.has(p.acceptanceId as string)
    )
      this.#fail('acceptance_without_original_call_or_duplicate')
    operation.accepted = true
    this.#acceptanceIds.add(p.acceptanceId as string)
  }
  #observeClose(frame: NativeSourceFrame, operation: Operation): void {
    const p = frame.payload
    if (
      p.complete !== true ||
      [...operation.records.values()].some(record => !record.final) ||
      operation.pending ||
      (operation.mcp && !operation.accepted)
    )
      this.#fail('incomplete_operation_close')
    operation.closed = true
  }
  #captureRpcAttempts(manifest: RpcSenderManifest): { end: number; attempts: Set<number> } {
    let end = 0
    const attempts = new Set<number>()
    for (const attempt of manifest.attempts) {
      if (attempt.start !== end || attempt.end <= end) this.#fail('rpc_attempt_manifest')
      end = attempt.end
      if (attempt.requestId !== null) {
        if (attempts.has(attempt.requestId) || manifest.allocations[attempt.requestId - 1]?.state !== 'ATTEMPTED')
          this.#fail('rpc_attempt_allocation')
        attempts.add(attempt.requestId)
      }
    }

    return { end, attempts }
  }
  #verifyRpcInputCoverage(manifest: RpcSenderManifest): void {
    if (
      this.#rpcInputs.length !== manifest.attempts.length ||
      (this.#rpcInputs.at(-1)?.end !== manifest.attemptedBytes && manifest.attemptedBytes !== 0)
    )
      this.#fail('rpc_missing_input_range')
  }
  #validateParseDisposition(frame: NativeSourceFrame): void {
    const disposition = frame.payload.parseDisposition

    const expected = disposition === 'PENDING' ? 'KNOWN' : disposition
    if (expected !== frame.disposition) this.#fail('contradictory_parse_disposition')
  }
  #rpcManifestForSeal(): RpcSenderManifest {
    if (
      !this.#rpcManifest ||
      !this.#rpcEof ||
      this.#rpcOutputPending ||
      this.#rpcInputs.some((_, i) => !['SETTLED', 'NOT_DISPATCHED'].includes(this.#rpcWork.get(i) ?? ''))
    )
      this.#fail('incomplete_source_range')
    return this.#rpcManifest!
  }
  #validateRpcSealFacts(frame: NativeSourceFrame, manifest: RpcSenderManifest): void {
    if (
      frame.payload.rpcIssuedRequests !== manifest.issuedRequests ||
      frame.payload.rpcWrittenBytes !== manifest.attemptedBytes ||
      frame.payload.rpcObservedRequests !== this.#rpcIds.size ||
      frame.payload.rpcInputRecords !== this.#rpcInputs.length ||
      frame.payload.rpcSenderSealDigest !== rpcSenderSealDigest(manifest)
    )
      this.#fail('incomplete_source_range')
  }
  #validateRpcInputKind(frame: NativeSourceFrame): void {
    const p = frame.payload
    if (
      p.framing !== 'LF' ||
      p.parseDisposition !== 'KNOWN' ||
      !['REQUEST', 'INITIALIZED_NOTIFICATION'].includes(p.messageKind as string)
    )
      this.#fail('rpc_input_framing_or_range')
  }
  #validRpcTransition(old: string | undefined, next: unknown): boolean {
    return (
      (!old && next === 'QUEUED') ||
      (old === 'QUEUED' && (next === 'NOT_DISPATCHED' || (next === 'DISPATCHED' && !this.#rpcEof))) ||
      (old === 'DISPATCHED' && next === 'SETTLED')
    )
  }
  #storeRawRecord(frame: NativeSourceFrame, operation: Operation, record: RawRecord): void {
    const p = frame.payload
    operation.records.set(record.rawSequence, {
      rawSequence: record.rawSequence,
      rawDigest: record.rawDigest,
      bytes: record.bytes,
      eventName: record.eventName,
      responseId: record.responseId,
      itemId: record.itemId,
      callId: record.callId,
      ...(p.parseDisposition === 'PENDING'
        ? {}
        : {
            final: {
              eventName: record.eventName,
              responseId: record.responseId,
              itemId: record.itemId,
              callId: record.callId,
              parseDisposition: p.parseDisposition as string,
            },
          }),
    })
  }
  #completeCreatedResponse(frame: NativeSourceFrame, operation: Operation, record: RawRecord): void {
    const p = frame.payload
    if (!p.responseId || p.responseId !== record.responseId || p.itemId || p.callId)
      this.#fail('response_created_lineage')
    operation.response = p.responseId as string
  }
  #validateResponseContext(frame: NativeSourceFrame, operation: Operation, record: RawRecord): void {
    const p = frame.payload
    const response = record.responseId ?? operation.response
    if (
      p.responseId !== response ||
      (record.responseId && operation.response && record.responseId !== operation.response)
    )
      this.#fail('parse_response_context')
  }
  #retainedParseRecord(frame: NativeSourceFrame, operation: Operation): RawRecord {
    const p = frame.payload
    const record = operation.records.get(p.rawSequence as number)
    if (!record || record.final || record.rawDigest !== p.rawDigest || operation.parent)
      this.#fail('orphan_duplicate_or_foreign_parse')
    const first = [...operation.records.values()].find(value => !value.final)
    if (first !== record) this.#fail('parse_completion_order')
    return record
  }
  #validateProvisionalLineage(frame: NativeSourceFrame, record: RawRecord): void {
    const p = frame.payload
    for (const field of ['responseId', 'itemId', 'callId'] as const)
      if (record[field] !== null && record[field] !== p[field]) this.#fail('parse_provisional_id_conflict')
    if (p.itemId !== record.itemId || p.callId !== record.callId) this.#fail('parse_invented_item_or_call')
  }
  #validateMcpProjection(frame: NativeSourceFrame, raw: NonNullable<Operation['raw']>): void {
    const p = frame.payload
    if (
      p.responseId !== raw.responseId ||
      p.itemId !== raw.itemId ||
      p.callId !== raw.callId ||
      frame.sourceCallId !== p.callId
    )
      this.#fail('mcp_call_original_raw_lineage')
  }
}
