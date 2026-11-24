import { codexLookupModel } from '@/lib/conversation/codex-lookup-contract'

import { readListedChatGptLookupModel } from './chatgpt-read-provider'
import { openCodexReadBroker } from './codex-read-broker'
import {
  configuredMacCodexReadExecutable,
  openMacCodexReadTransport,
  type MacCodexReadImage,
} from './codex-read-launcher'
import { runCodexRecordLookup } from './codex-read-provider'
import type { ConversationLookupProvider } from './conversation-read-service'

type ReadToken = () => Promise<string | undefined>

async function tokenForNativeModel(readToken: ReadToken, signal: AbortSignal) {
  const token = await readToken().catch(() => undefined)
  if (!token || signal.aborted) return undefined
  const model = await readListedChatGptLookupModel(fetch, `Bearer ${token}`, signal, [codexLookupModel]).catch(
    () => undefined,
  )
  return model && !signal.aborted ? token : undefined
}

async function runNativeLookup(
  { query, lookup, signal }: Parameters<ConversationLookupProvider>[0],
  image: MacCodexReadImage,
  readToken: ReadToken,
): ReturnType<ConversationLookupProvider> {
  const broker = await openCodexReadBroker({ query, signal, readToken }).catch(() => undefined)
  if (!broker) return 'failed'
  try {
    await runCodexRecordLookup(
      {
        query,
        lookup,
        signal,
        authorizeToolCall: broker.authorizeToolCall,
        acknowledgeToolCall: broker.confirmToolCall,
      },
      ({ args }, launchSignal) =>
        openMacCodexReadTransport(
          {
            ...image,
            brokerPort: broker.port,
            brokerToken: broker.token,
            args: [...args, '-c', `model_providers.openai_chatgpt_plan.base_url="http://127.0.0.1:${broker.port}/v1"`],
          },
          launchSignal,
        ),
    )
    if (!broker.completed()) throw new Error('The lookup broker did not confirm completion.')
    return 'completed'
  } catch {
    if (broker.sent() === 0) return 'failed'
    throw new Error('The native Codex lookup could not be confirmed.')
  } finally {
    await broker.stop()
  }
}

export function createConfiguredCodexReadProvider(readToken: ReadToken): ConversationLookupProvider {
  return async input => {
    const image = configuredMacCodexReadExecutable()
    if (!image || input.signal.aborted) return 'failed'
    const token = await tokenForNativeModel(readToken, input.signal)
    if (!token) return 'failed'
    return runNativeLookup(input, image, async () => ((await readToken()) === token ? token : undefined))
  }
}
