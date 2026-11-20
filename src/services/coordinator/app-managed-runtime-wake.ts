import type { PrismaClient } from '@prisma/client'

type Scope = { journeyId: string; targetProjectId: string; expectedStateHash: string }
type Wake = (input: Scope, client: PrismaClient) => void
const owner = globalThis as typeof globalThis & { appraiseManagedRuntimeWake?: Wake }

/** One process-local callback, shared across Next bundles; hot reload replaces rather than accumulates listeners. */
export function registerAppManagedRuntimeWake(wake: Wake) {
  owner.appraiseManagedRuntimeWake = wake
  return () => {
    if (owner.appraiseManagedRuntimeWake === wake) delete owner.appraiseManagedRuntimeWake
  }
}

export function notifyAppManagedRuntimeTerminal(input: Scope, client: PrismaClient) {
  owner.appraiseManagedRuntimeWake?.(input, client)
}
