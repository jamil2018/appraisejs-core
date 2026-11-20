import type { PrismaClient } from '@prisma/client'
import { expect, it, vi } from 'vitest'
import { notifyAppManagedRuntimeTerminal, registerAppManagedRuntimeWake } from './app-managed-runtime-wake'

it('replaces hot-reloaded registration and does not retain stale listeners', () => {
  const first = vi.fn(),
    next = vi.fn()
  const removeFirst = registerAppManagedRuntimeWake(first)
  const removeNext = registerAppManagedRuntimeWake(next)
  removeFirst()
  const scope = { journeyId: 'journey', targetProjectId: 'project', expectedStateHash: 'state' }
  const client = {} as PrismaClient
  notifyAppManagedRuntimeTerminal(scope, client)
  expect(first).not.toHaveBeenCalled()
  expect(next).toHaveBeenCalledExactlyOnceWith(scope, client)
  removeNext()
  notifyAppManagedRuntimeTerminal(scope, client)
  expect(next).toHaveBeenCalledOnce()
})
