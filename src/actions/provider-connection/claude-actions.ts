'use server'

import {
  disconnectClaudeCode,
  getClaudeCodeConnection,
  startClaudeCodeSignIn,
} from '@/services/provider-connection/claude-code-connection-service'

export async function readClaudeCodeConnection() {
  return getClaudeCodeConnection()
}

export async function beginClaudeCodeConnection() {
  return startClaudeCodeSignIn()
}

export async function disconnectClaudeCodeConnection() {
  return disconnectClaudeCode()
}
