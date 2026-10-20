/** Server-side SDK transport guard. Reports the one scoped call before dispatch. */
const ID = value =>
  (typeof value === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(value)) || (Number.isSafeInteger(value) && value >= 0)
const SETUP = new Set(['initialize', 'notifications/initialized', 'tools/list', 'ping'])
const bounded = (value, limit) => {
  const text = JSON.stringify(value)
  if (typeof text !== 'string' || Buffer.byteLength(text) > limit) throw new Error('scoped audit byte ceiling')
  return JSON.parse(text)
}

export function instrumentScopedServerTransport({ transport, report, onUnknown }) {
  if (
    !transport ||
    typeof transport.start !== 'function' ||
    typeof transport.send !== 'function' ||
    typeof transport.close !== 'function' ||
    typeof report !== 'function' ||
    typeof onUnknown !== 'function'
  )
    throw new Error('scoped server transport ports required')
  let receiver = null
  let errorReceiver = null
  let closeReceiver = null
  let fenced = false
  const pending = new Set()
  const unknown = error => {
    const first = !fenced
    fenced = true
    if (first) onUnknown()
    throw error
  }
  transport.onmessage = message => {
    void (async () => {
      if (fenced || !message || typeof message !== 'object' || Array.isArray(message))
        return unknown(new Error('scoped transport fenced'))
      if (message.method === 'tools/call') {
        if (!ID(message.id) || pending.has(message.id) || typeof message.params?.name !== 'string')
          return unknown(new Error('unpaired scoped request'))
        const args = bounded(message.params.arguments, 16 * 1024)
        // A durable supervisor reservation must acknowledge this before the SDK sees it.
        await report({ kind: 'request', id: message.id, name: message.params.name, arguments: args })
        pending.add(message.id)
      } else if (!SETUP.has(message.method)) return unknown(new Error('unexpected scoped request'))
      if (receiver) receiver(message)
    })().catch(error => {
      try {
        unknown(error)
      } catch {
        /* onUnknown already fenced this child */
      }
    })
  }
  transport.onerror = error => {
    fenced = true
    onUnknown()
    if (errorReceiver) errorReceiver(error)
  }
  transport.onclose = () => {
    if (pending.size) {
      fenced = true
      onUnknown()
    }
    if (closeReceiver) closeReceiver()
  }
  return Object.freeze({
    start: () => transport.start(),
    async send(message) {
      if (fenced) throw new Error('scoped transport fenced')
      try {
        if (pending.has(message?.id)) {
          if (!Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error'))
            return unknown(new Error('scoped response failed'))
          const result = bounded(message.result, 32 * 1024)
          await report({ kind: 'result', id: message.id, result })
          pending.delete(message.id)
        }
        return await transport.send(message)
      } catch (error) {
        return unknown(error)
      }
    },
    close: () => transport.close(),
    set onmessage(handler) {
      receiver = handler
    },
    get onmessage() {
      return receiver
    },
    set onerror(handler) {
      errorReceiver = handler
    },
    get onerror() {
      return errorReceiver
    },
    set onclose(handler) {
      closeReceiver = handler
    },
    get onclose() {
      return closeReceiver
    },
    snapshot: () => Object.freeze({ pending: pending.size, fenced }),
  })
}
