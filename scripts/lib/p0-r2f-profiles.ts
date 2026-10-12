#!/usr/bin/env node

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createManagedWorkerRegistrationProfile } from '../../src/lib/quality-journey/managed-worker-gateway'
import { registerAppraiseOperations } from '../../packages/appraisejs/src/mcp/registry'

export const P0_R2F_ROLES = [
  'REQUIREMENT_ANALYZER',
  'SCOUT',
  'RESOURCE_EXPLORER',
  'TEST_SCENARIO_DESIGNER',
  'AUTOMATOR',
  'TRIAGER',
] as const

export type P0R2fRole = (typeof P0_R2F_ROLES)[number]

function canonicalDefinitions() {
  return registerAppraiseOperations({
    server: { registerResource: () => ({}), registerTool: () => ({}) } as never,
    api: new Proxy({}, { get: () => async () => ({}) }) as never,
    options: {
      baseUrl: 'http://127.0.0.1:3000',
      coordinatorId: 'p0-r2f-schema-transport',
      cwd: process.cwd(),
    },
  })
}

export function createP0R2fProfiles() {
  const definitions = canonicalDefinitions()
  return Object.fromEntries(
    P0_R2F_ROLES.map(role => [role, createManagedWorkerRegistrationProfile(role, definitions)]),
  ) as Record<P0R2fRole, ReturnType<typeof createManagedWorkerRegistrationProfile>>
}

async function main() {
  const [mode = 'profiles', requestedRole] = process.argv.slice(2)
  const profiles = createP0R2fProfiles()
  if (mode === 'profiles') {
    process.stdout.write(`${JSON.stringify(profiles)}\n`)
    return
  }
  if (mode === 'profile' && requestedRole && requestedRole in profiles) {
    process.stdout.write(`${JSON.stringify(profiles[requestedRole as P0R2fRole])}\n`)
    return
  }
  throw new Error('Expected p0-r2f profiles or profile <canonical-role>.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) void main()
