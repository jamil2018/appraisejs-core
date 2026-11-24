'use server'

import {
  chatGptConnection,
  isChatGptConnectionSupported,
} from '@/services/provider-connection/chatgpt-connection-service'

export async function readChatGptConnection() {
  if (!isChatGptConnectionSupported()) return { state: 'unavailable' as const }
  return chatGptConnection.status()
}

export async function readChatGptProfiles() {
  if (!isChatGptConnectionSupported()) return []
  return chatGptConnection.profiles()
}

export async function beginChatGptConnection(selection?: string) {
  if (!isChatGptConnectionSupported()) return { state: 'unavailable' as const }
  if (selection !== undefined && selection !== 'new' && !/^[0-9a-f]{64}$/.test(selection)) {
    return { state: 'failed' as const }
  }
  return chatGptConnection.start(selection)
}

export async function cancelChatGptConnection() {
  return chatGptConnection.cancel()
}

export async function disconnectChatGptConnection() {
  if (!isChatGptConnectionSupported()) return { state: 'unavailable' as const }
  return chatGptConnection.disconnect()
}
