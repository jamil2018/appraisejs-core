import { z } from 'zod'

import { ServiceError } from '@/services/shared/errors'

import { type ClaudeCodeCli, type ClaudeCodeReply, resolveClaudeCodeCli } from './claude-code-cli'

export type ClaudeCodeConnectionStatus = {
  state: 'unavailable' | 'disconnected' | 'authorizing' | 'connected' | 'failed'
  message?: string
}

const unavailable: ClaudeCodeConnectionStatus = {
  state: 'unavailable',
  message: 'Set up a verified Claude Code installation on the Appraise macOS host to connect.',
}

const authStatus = z.object({
  loggedIn: z.boolean(),
  authMethod: z.string().optional(),
  email: z.string().optional(),
  orgId: z.string().optional(),
  apiProvider: z.string().optional(),
})

async function readSession(cli: ClaudeCodeCli, signal?: AbortSignal) {
  const reply = await cli.run('status', { signal })
  if (reply.exitCode !== 0 && reply.exitCode !== 1) throw new Error('Claude Code status unavailable.')
  const auth = authStatus.parse(JSON.parse(reply.output))
  if (auth.loggedIn !== (reply.exitCode === 0)) throw new Error('Claude Code returned inconsistent status.')
  return auth.loggedIn ? JSON.stringify([auth.authMethod, auth.email, auth.orgId, auth.apiProvider]) : undefined
}

export function createClaudeCodeConnection(resolveCli: () => Promise<ClaudeCodeCli | undefined>) {
  let operation: 'login' | 'logout' | undefined
  let failure: ClaudeCodeConnectionStatus | undefined
  let revision = 0
  let activeReads = 0

  async function status(): Promise<ClaudeCodeConnectionStatus> {
    if (operation) return { state: 'authorizing' }
    const startedAt = revision
    const cli = await resolveCli()
    if (startedAt !== revision) return status()
    if (!cli) return unavailable
    if (failure) return failure
    try {
      const session = await readSession(cli)
      if (startedAt !== revision) return status()
      return { state: session ? 'connected' : 'disconnected' }
    } catch {
      return { state: 'failed', message: 'Claude Code could not check your sign-in.' }
    }
  }

  async function changeSession(command: 'login' | 'logout'): Promise<ClaudeCodeConnectionStatus> {
    if (operation) return { state: 'authorizing' }
    if (activeReads > 0) return { state: 'connected', message: 'Wait for the current lookup to finish.' }
    operation = command
    revision += 1
    failure = undefined

    const cli = await resolveCli()
    if (!cli) {
      operation = undefined
      return unavailable
    }

    const finish = async () => {
      try {
        const result = await cli.run(command)
        if (result.exitCode !== 0) throw new Error('Claude Code did not confirm the requested session change.')
        const session = await readSession(cli)
        if (Boolean(session) !== (command === 'login')) {
          throw new Error('Claude Code did not confirm the requested session change.')
        }
      } catch {
        failure = {
          state: 'failed',
          message: command === 'login' ? 'Claude Code could not complete sign-in.' : 'Claude Code could not sign out.',
        }
      } finally {
        operation = undefined
      }
    }

    if (command === 'login') {
      void finish()
      return { state: 'authorizing' }
    }
    await finish()
    return failure ?? { state: 'disconnected' }
  }

  async function bindLookup() {
    const unavailableSession = () =>
      new ServiceError('Connect Claude Code in Settings before sending a lookup.', 'CONFLICT')
    if (operation) throw unavailableSession()
    const boundRevision = revision
    const cli = await resolveCli()
    const session = await (cli && readSession(cli).catch(() => undefined))
    if (!cli || !session || operation || boundRevision !== revision) throw unavailableSession()

    return async (
      run: (cli: ClaudeCodeCli) => Promise<ClaudeCodeReply>,
      signal: AbortSignal,
    ): Promise<ClaudeCodeReply | undefined> => {
      if (operation || boundRevision !== revision || signal.aborted) return undefined
      activeReads += 1
      try {
        if ((await readSession(cli, signal).catch(() => undefined)) !== session) return undefined
        signal.throwIfAborted()
        return await run(cli)
      } finally {
        activeReads -= 1
      }
    }
  }

  return { status, signIn: () => changeSession('login'), signOut: () => changeSession('logout'), bindLookup }
}

const processState = globalThis as typeof globalThis & {
  appraiseClaudeCodeConnection?: ReturnType<typeof createClaudeCodeConnection>
}
const connection = (processState.appraiseClaudeCodeConnection ??= createClaudeCodeConnection(resolveClaudeCodeCli))

export const getClaudeCodeConnection = connection.status
export const startClaudeCodeSignIn = connection.signIn
export const disconnectClaudeCode = connection.signOut
export const bindClaudeCodeLookup = connection.bindLookup
