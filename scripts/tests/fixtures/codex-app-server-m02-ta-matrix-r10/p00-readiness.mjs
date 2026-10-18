/** Source-bound required-MCP failure predicate; neither function starts a process. */
import { createHash } from 'node:crypto'

const sha = value => createHash('sha256').update(value).digest('hex')
const exact = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const receiptBase = value =>
  value?.schema === 'appraise.m02-ta-matrix-child-receipt/v1' &&
  value.caseId === 'P00' &&
  value.evidenceClass === 'TRUSTED_CHILD_SELF_REPORT'

export function inspectP00RequiredMcpError(error) {
  if (
    !error ||
    typeof error !== 'object' ||
    Array.isArray(error) ||
    !Object.keys(error).every(key => ['code', 'message', 'data'].includes(key)) ||
    error.code !== -32603 ||
    (error.data !== undefined && error.data !== null) ||
    typeof error.message !== 'string' ||
    Buffer.byteLength(error.message) > 4096 ||
    !error.message.startsWith('error creating thread: ') ||
    !error.message.includes('required MCP servers failed to initialize') ||
    !/(?:^|[^A-Za-z0-9_-])appraise_m02(?:$|[^A-Za-z0-9_-])/.test(error.message)
  )
    return Object.freeze({ status: 'UNKNOWN_REQUIRED_MCP_ERROR', accepted: false })
  return Object.freeze({
    status: 'SOURCE_SHAPED_REQUIRED_MCP_RPC_ERROR',
    accepted: true,
    messageSha256: sha(error.message),
    sourceOnly: true,
  })
}

export function verifyP00Completion({ rpcError, journal, startupReceipt, exitReceipt, ownedCodexExit }) {
  const counts = journal?.counts
  const exit = ownedCodexExit?.exit,
    close = ownedCodexExit?.close
  if (
    rpcError?.accepted !== true ||
    journal?.fenced ||
    journal?.activeCase !== 'P00' ||
    !counts ||
    counts.codexStarts !== 1 ||
    counts.mcpStarts !== 1 ||
    counts.threadStarts !== 1 ||
    counts.listenerStarts !== 1 ||
    counts.turnStarts !== 0 ||
    counts.providerRequests !== 0 ||
    counts.scopedCalls !== 0 ||
    counts.canonicalRequests !== 0 ||
    counts.auditRequests !== 0 ||
    counts.permissionReplies !== 0 ||
    counts.outerCalls !== 0 ||
    !exact(startupReceipt, ['schema', 'caseId', 'evidenceClass', 'event']) ||
    !receiptBase(startupReceipt) ||
    startupReceipt.event !== 'required-failure-selected' ||
    !exact(exitReceipt, ['schema', 'caseId', 'evidenceClass', 'event', 'exitCode']) ||
    !receiptBase(exitReceipt) ||
    exitReceipt.event !== 'node-exit-handler' ||
    exitReceipt.exitCode !== 1 ||
    !exit ||
    !close ||
    exit.code !== close.code ||
    exit.signal !== close.signal ||
    !((exit.code === 0 && exit.signal === null) || (exit.code === null && exit.signal === 'SIGTERM'))
  )
    return Object.freeze({ status: 'UNKNOWN_P00_COMPLETION', accepted: false })
  return Object.freeze({
    status: 'REQUIRED_MCP_FAILURE_CORRELATED',
    accepted: true,
    rpcMessageSha256: rpcError.messageSha256,
    runtimeQualified: false,
  })
}

export function createP00ProtocolVerifiers({ journal, readReceipt }) {
  if (typeof journal?.snapshot !== 'function' || typeof readReceipt !== 'function')
    throw new Error('P00 trusted receipt ports missing')
  let rpcError = null
  let startupReceipt = null
  let exitReceipt = null
  const selectedFailure = async () => {
    const state = journal.snapshot()
    if (
      state.activeCase !== 'P00' ||
      state.fenced ||
      state.counts?.turnStarts !== 0 ||
      state.counts?.providerRequests !== 0 ||
      state.counts?.scopedCalls !== 0 ||
      state.counts?.canonicalRequests !== 0 ||
      state.counts?.auditRequests !== 0
    )
      return false
    const startup = await readReceipt('P00', 'mcp-startup.json')
    const exit = await readReceipt('P00', 'mcp-exit.json')
    if (
      !exact(startup, ['schema', 'caseId', 'evidenceClass', 'event']) ||
      !receiptBase(startup) ||
      startup.event !== 'required-failure-selected' ||
      !exact(exit, ['schema', 'caseId', 'evidenceClass', 'event', 'exitCode']) ||
      !receiptBase(exit) ||
      exit.event !== 'node-exit-handler' ||
      exit.exitCode !== 1
    )
      return false
    startupReceipt = startup
    exitReceipt = exit
    return true
  }
  return Object.freeze({
    async verifyRequiredMcpTelemetry(params, context) {
      return (
        params?.name === 'appraise_m02' &&
        params?.status === 'failed' &&
        context?.caseId === 'P00' &&
        (await selectedFailure())
      )
    },
    async verifyRequiredMcpFailure(error, context) {
      const inspected = inspectP00RequiredMcpError(error)
      if (
        !inspected.accepted ||
        context?.caseId !== 'P00' ||
        context.threadStartId !== 'P00-thread-start' ||
        !journal.snapshot().pending.some(item => item.kind === 'threadStarts' && item.id === context.threadStartId) ||
        !(await selectedFailure())
      )
        return false
      rpcError = inspected
      return true
    },
    snapshot: () => Object.freeze({ rpcError, startupReceipt, exitReceipt, runtimeQualified: false }),
  })
}
