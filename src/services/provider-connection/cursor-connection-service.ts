import { z } from 'zod'

import { ServiceError } from '@/services/shared/errors'

import { type CursorCli, resolveCursorCli } from './cursor-cli'
import { bindVerifiedNativeLookup } from './native-lookup-binding'

export type CursorConnectionStatus = {
  state: 'unavailable' | 'disconnected' | 'authorizing' | 'connected' | 'failed'
  message?: string
}

const unavailable: CursorConnectionStatus = {
  state: 'unavailable',
  message: 'Set up a verified Cursor CLI bundle on the Appraise macOS host to connect.',
}

const accountStatus = z.object({
  status: z.enum(['authenticated', 'partially-authenticated', 'unauthenticated']),
  isAuthenticated: z.boolean(),
  hasAccessToken: z.boolean(),
  hasRefreshToken: z.boolean(),
  userInfo: z
    .object({
      userId: z.union([z.string().trim().min(1), z.number().int().positive().safe()]).nullish(),
      email: z.string().email().nullish(),
    })
    .nullish(),
})

function verifiedAccount(status: z.infer<typeof accountStatus>) {
  if (status.status !== 'authenticated' && !status.isAuthenticated) return undefined
  const { userId, email } = status.userInfo ?? {}
  const authorized = [status.isAuthenticated, status.hasAccessToken, status.hasRefreshToken].every(Boolean)
  if (!authorized || (!userId && !email)) throw new Error('Cursor did not verify a browser account.')
  return userId == null ? `email:${email}` : `user-id:${userId}`
}

async function readAccount(cli: CursorCli, signal?: AbortSignal) {
  const reply = await cli.auth('status', signal)
  if (reply.exitCode !== 0) throw new Error('Cursor account status unavailable.')
  return verifiedAccount(accountStatus.parse(JSON.parse(reply.output)))
}

async function observedAccount(cli: CursorCli): Promise<'connected' | 'disconnected' | 'failed'> {
  try {
    return (await readAccount(cli)) ? 'connected' : 'disconnected'
  } catch {
    return 'failed'
  }
}

function observedStatus(observed: 'disconnected' | 'failed'): CursorConnectionStatus {
  if (observed === 'disconnected') return { state: 'disconnected' }
  return { state: 'failed', message: 'Cursor could not check your sign-in.' }
}

export function createCursorConnection(resolveCli: () => Promise<CursorCli | undefined>) {
  let operation: 'login' | 'logout' | undefined
  let failure: CursorConnectionStatus | undefined
  let revision = 0
  let activeReads = 0

  async function status(): Promise<CursorConnectionStatus> {
    if (operation) return { state: 'authorizing' }
    const startedAt = revision
    const cli = await resolveCli()
    if (startedAt !== revision) return status()
    if (!cli) return unavailable
    const observed = await observedAccount(cli)
    if (startedAt !== revision) return status()
    if (observed === 'connected') {
      failure = undefined
      return { state: 'connected' }
    }
    return failure ?? observedStatus(observed)
  }

  async function changeSession(command: 'login' | 'logout'): Promise<CursorConnectionStatus> {
    if (operation) return { state: 'authorizing' }
    if (activeReads > 0) return { state: 'connected', message: 'Wait for the current lookup to finish.' }
    operation = command
    revision += 1
    failure = undefined

    async function finish(cli: CursorCli) {
      try {
        const result = await cli.auth(command)
        if (result.exitCode !== 0 || Boolean(await readAccount(cli)) !== (command === 'login')) {
          throw new Error('Cursor did not confirm the requested session change.')
        }
      } catch {
        failure = {
          state: 'failed',
          message:
            command === 'login'
              ? 'Cursor could not complete sign-in. Make sure this Mac can open its default browser, then try again.'
              : 'Cursor could not sign out.',
        }
      } finally {
        operation = undefined
      }
    }

    const cli = await resolveCli()
    if (!cli) {
      operation = undefined
      return unavailable
    }
    if (command === 'login') {
      void finish(cli)
      return { state: 'authorizing' }
    }
    await finish(cli)
    return failure ?? { state: 'disconnected' }
  }

  async function bindLookup() {
    const disconnected = () => new ServiceError('Connect Cursor in Settings before sending a lookup.', 'CONFLICT')
    const boundRevision = revision
    return bindVerifiedNativeLookup<CursorCli, boolean, false>({
      resolveCli,
      identify: readAccount,
      current: () => !operation && boundRevision === revision,
      active: delta => {
        activeReads += delta
      },
      unavailable: disconnected,
      failed: false,
    })
  }

  return { status, signIn: () => changeSession('login'), signOut: () => changeSession('logout'), bindLookup }
}

const processState = globalThis as typeof globalThis & {
  appraiseCursorConnection?: ReturnType<typeof createCursorConnection>
}
const connection = (processState.appraiseCursorConnection ??= createCursorConnection(resolveCursorCli))

export const getCursorConnection = connection.status
export const startCursorSignIn = connection.signIn
export const disconnectCursor = connection.signOut
export const bindCursorLookup = connection.bindLookup
