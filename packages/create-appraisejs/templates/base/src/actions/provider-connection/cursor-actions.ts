'use server'

import {
  disconnectCursor,
  getCursorConnection,
  startCursorSignIn,
} from '@/services/provider-connection/cursor-connection-service'

export async function readCursorConnection() {
  return getCursorConnection()
}

export async function beginCursorConnection() {
  return startCursorSignIn()
}

export async function disconnectCursorConnection() {
  return disconnectCursor()
}
