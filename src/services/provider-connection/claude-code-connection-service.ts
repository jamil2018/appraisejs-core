import { createHash } from 'node:crypto'
import { z } from 'zod'

import { ServiceError } from '@/services/shared/errors'
import type { ManagedWorkerPreferences } from '@/lib/quality-journey/managed-worker-preferences'

import {
  type ClaudeCodeCli,
  ClaudeCodeLegacyCredentialError,
  type ClaudeCodeReply,
  resolveClaudeCodeCli,
} from './claude-code-cli'
import { bindVerifiedNativeLookup } from './native-lookup-binding'

export type ClaudeCodeConnectionStatus = {
  state: 'unavailable' | 'disconnected' | 'authorizing' | 'connected' | 'failed'
  message?: string
  requiresDisconnect?: true
}

const unavailable: ClaudeCodeConnectionStatus = {
  state: 'unavailable',
  message: 'Set up a verified Claude Code installation on the Appraise macOS host to connect.',
}

const authStatus = z.object({
  loggedIn: z.boolean(),
  authMethod: z.string().optional(),
  email: z.string().nullish(),
  orgId: z.string().optional(),
  apiProvider: z.string().optional(),
  subscriptionType: z.string().nullish(),
})

const subscriptionAuth = z.object({
  authMethod: z.literal('claude.ai'),
  apiProvider: z.literal('firstParty'),
  email: z.string().trim().min(1),
  subscriptionType: z.enum(['free', 'pro', 'max', 'ultra', 'team', 'enterprise']),
})

const subscriptionRequired: ClaudeCodeConnectionStatus = {
  state: 'failed',
  message:
    'Claude Code could not verify an eligible Claude subscription. Connect your Claude subscription to continue.',
}

const legacyCredential: ClaudeCodeConnectionStatus = {
  state: 'failed',
  message: 'Clear the previous Claude Code sign-in, then reconnect to store credentials in Keychain.',
  requiresDisconnect: true,
}

function identifySubscription(auth: z.infer<typeof authStatus>) {
  const subscription = subscriptionAuth.safeParse(auth)
  if (!auth.loggedIn || !subscription.success) return undefined
  return JSON.stringify([subscription.data.email, auth.orgId, subscription.data.subscriptionType])
}

async function readSession(cli: ClaudeCodeCli, signal?: AbortSignal) {
  const reply = await cli.run('status', { signal })
  if (reply.exitCode !== 0 && reply.exitCode !== 1) throw new Error('Claude Code status unavailable.')
  const auth = authStatus.parse(JSON.parse(reply.output))
  if (auth.loggedIn !== (reply.exitCode === 0)) throw new Error('Claude Code returned inconsistent status.')
  return auth
}

async function observedSubscription(cli: ClaudeCodeCli): Promise<ClaudeCodeConnectionStatus> {
  try {
    const session = await readSession(cli)
    if (!session.loggedIn) return { state: 'disconnected' }
    return identifySubscription(session) ? { state: 'connected' } : subscriptionRequired
  } catch (error) {
    if (error instanceof ClaudeCodeLegacyCredentialError) return legacyCredential
    return { state: 'failed', message: 'Claude Code could not check your sign-in.' }
  }
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
    const observed = await observedSubscription(cli)
    if (startedAt !== revision) return status()
    return observed
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
        if (session.loggedIn !== (command === 'login')) {
          throw new Error('Claude Code did not confirm the requested session change.')
        }
        if (session.loggedIn && !identifySubscription(session)) failure = subscriptionRequired
      } catch (error) {
        failure =
          error instanceof ClaudeCodeLegacyCredentialError
            ? legacyCredential
            : {
                state: 'failed',
                message:
                  command === 'login' ? 'Claude Code could not complete sign-in.' : 'Claude Code could not sign out.',
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
    const boundRevision = revision
    return bindVerifiedNativeLookup<ClaudeCodeCli, ClaudeCodeReply, undefined>({
      resolveCli,
      identify: (cli, signal) => readSession(cli, signal).then(identifySubscription),
      current: () => !operation && boundRevision === revision,
      active: delta => {
        activeReads += delta
      },
      unavailable: unavailableSession,
      failed: undefined,
    })
  }

  async function bindJourney() {
    const unavailableSession = () =>
      new ServiceError('Connect Claude Code in Settings before starting a Journey role.', 'CONFLICT')
    const boundRevision = revision
    if (operation) throw unavailableSession()
    const cli = await resolveCli()
    if (!cli?.executableSha256 || !/^[a-f0-9]{64}$/.test(cli.executableSha256)) throw unavailableSession()
    const subscription = await readSession(cli)
      .then(identifySubscription)
      .catch(() => undefined)
    if (!subscription || operation || revision !== boundRevision) throw unavailableSession()
    const identity = {
      executableSha256: cli.executableSha256,
      accountFingerprint: createHash('sha256')
        .update('appraise.claude-code.account.v1\0')
        .update(subscription)
        .digest('hex'),
      protocol: 'claude-code-print/v1' as const,
    }
    let consumed = false
    return {
      identity,
      async run(
        prompt: string,
        outputSchema?: object,
        preferences: ManagedWorkerPreferences = {},
      ): Promise<ClaudeCodeReply> {
        if (consumed || operation || revision !== boundRevision) throw unavailableSession()
        consumed = true
        activeReads += 1
        try {
          const current = await resolveCli()
          if (!current || current.executableSha256 !== identity.executableSha256) throw unavailableSession()
          const currentSubscription = await readSession(current)
            .then(identifySubscription)
            .catch(() => undefined)
          if (!currentSubscription || currentSubscription !== subscription || operation || revision !== boundRevision) {
            throw unavailableSession()
          }
          return await current.run('journey', {
            input: prompt,
            journeySchema: outputSchema,
            ...(preferences.managedWorkerModel ? { journeyModel: preferences.managedWorkerModel } : {}),
            ...(preferences.managedWorkerEffort ? { journeyEffort: preferences.managedWorkerEffort } : {}),
          })
        } finally {
          activeReads -= 1
        }
      },
    }
  }

  return {
    status,
    signIn: () => changeSession('login'),
    signOut: () => changeSession('logout'),
    bindLookup,
    bindJourney,
  }
}

const processState = globalThis as typeof globalThis & {
  appraiseClaudeCodeConnection?: ReturnType<typeof createClaudeCodeConnection>
}
const connection = (processState.appraiseClaudeCodeConnection ??= createClaudeCodeConnection(resolveClaudeCodeCli))

export const getClaudeCodeConnection = connection.status
export const startClaudeCodeSignIn = connection.signIn
export const disconnectClaudeCode = connection.signOut
export const bindClaudeCodeLookup = connection.bindLookup
export const bindClaudeCodeJourney = connection.bindJourney
