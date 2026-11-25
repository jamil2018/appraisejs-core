import { requestCursorLookup } from '@/services/provider-connection/cursor-acp'
import { bindCursorLookup } from '@/services/provider-connection/cursor-connection-service'

import type { ConversationLookupProvider } from './conversation-read-service'

export async function createCursorReadProvider(bindLookup = bindCursorLookup): Promise<ConversationLookupProvider> {
  const run = await bindLookup()
  return async ({ lookup, signal }) => {
    const authorized = await run(
      cli => cli.lookup((child, cwd) => requestCursorLookup(child, cwd, signal), signal),
      signal,
    )
    if (!authorized) return 'failed'
    signal.throwIfAborted()
    await lookup()
    return 'completed'
  }
}
