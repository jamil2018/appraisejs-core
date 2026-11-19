import { AsyncLocalStorage } from 'node:async_hooks'
import {
  createManagedWorkerLoopbackServer,
  type ManagedWorkerLoopbackOptions,
  type ManagedWorkerLoopbackRequestContext,
} from '../../../../packages/appraisejs/src/mcp/managed-worker-loopback-server'
import {
  claimNativeQualificationAnalysisReplyLoss,
  matchesNativeQualificationAnalysisReplyLoss,
  waitNativeQualificationLossPhysicalRelease,
  failNativeQualificationLoss,
  inspectNativeQualificationLoss,
  type NativeQualificationLossControl,
} from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-loss'

type RequestScope = { original: ManagedWorkerLoopbackRequestContext; bytesBefore: number }
/** Same listener and gateway. The shared original loss controller is the sole selection/pause/release owner. */
export async function createOriginalLossEndpoint(
  options: Omit<ManagedWorkerLoopbackOptions, 'trustedRequestContext'>,
  control: NativeQualificationLossControl,
) {
  const scope = new AsyncLocalStorage<RequestScope>()
  let drop: { requested: boolean; closed: boolean; bytesBefore: number; bytesAfter: number | null } | undefined
  function assertUnwrittenContext(context: RequestScope | undefined): asserts context is RequestScope {
    if (
      !context ||
      !context.original.originalSocketExclusive() ||
      context.original.socket.bytesWritten !== context.bytesBefore ||
      context.original.response.headersSent ||
      context.original.socket.destroyed
    )
      throw new Error('Original selected response context unavailable')
  }
  function destroySelectedResponse(
    context: RequestScope,
    call: { toolName: string; arguments: Record<string, unknown> },
  ) {
    const { original: request, bytesBefore } = context
    if (
      drop ||
      !request.originalSocketExclusive() ||
      request.response.headersSent ||
      request.response.writableEnded ||
      request.response.destroyed ||
      request.socket.destroyed ||
      request.socket.bytesWritten !== bytesBefore
    ) {
      failNativeQualificationLoss(control)
      throw new Error('Selected original response is not exclusively unwritten')
    }
    drop = { requested: true, closed: false, bytesBefore, bytesAfter: null }
    const observed = drop
    request.socket.once('close', () => {
      observed.closed = true
      observed.bytesAfter = request.socket.bytesWritten
    })
    request.socket.destroy()
    // Original selected socket is already destroyed. Returning accepted internally lets the actual SDK settle.
    claimNativeQualificationAnalysisReplyLoss(control, returned, call)
  }
  const original = await createManagedWorkerLoopbackServer({
    ...options,
    trustedRequestContext(context, enterOriginal) {
      const length = context.request.headers['content-length']
      if (
        context.request.headers.expect ||
        context.request.headers['transfer-encoding'] ||
        typeof length !== 'string' ||
        String(Number(length)) !== length ||
        !context.originalSocketExclusive() ||
        context.response.headersSent ||
        context.socket.destroyed
      )
        throw new Error('Original controlled HTTP request framing refused')
      return scope.run({ original: context, bytesBefore: context.socket.bytesWritten }, enterOriginal)
    },
    async callGateway(input) {
      const context = scope.getStore()
      assertUnwrittenContext(context)
      const accepted = await options.callGateway(input)
      const call = { toolName: input.toolName, arguments: input.arguments }
      if (matchesNativeQualificationAnalysisReplyLoss(control, call)) {
        destroySelectedResponse(context, call)
      }
      return accepted
    },
  })
  let closeFlight: ReturnType<typeof original.close> | undefined
  const returned = Object.freeze({
    ...original,
    snapshot: () =>
      Object.freeze({
        ...original.snapshot(),
        lossReply: drop ? { ...drop, zeroByteDelta: drop.closed && drop.bytesAfter === drop.bytesBefore } : null,
      }),
    close() {
      const deadline = Math.min(Date.now() + options.cleanupMs, inspectNativeQualificationLoss(control).cleanupDeadline)
      closeFlight ??= (async () => {
        const release = await waitNativeQualificationLossPhysicalRelease(control)
        const closed = await original.close(Math.min(deadline, inspectNativeQualificationLoss(control).cleanupDeadline))
        const dropped = drop && drop.closed && drop.bytesBefore === drop.bytesAfter
        if (release.emergency || !release.pauseCommitted || (drop && !dropped))
          return Object.freeze({ closed: false, effectUnknown: true })
        return closed
      })()
      return closeFlight
    },
  })
  return returned
}
