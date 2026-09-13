#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { z } from '../../packages/appraisejs/node_modules/zod/index.js'

import {
  createManagedWorkerRegistrationProfile,
  executeManagedWorkerGatewayCall,
  sealManagedWorkerRuntimeGrant,
} from '../../src/lib/quality-journey/managed-worker-gateway'
import { registerAppraiseOperations } from '../../packages/appraisejs/src/mcp/registry'

const role = 'REQUIREMENT_ANALYZER' as const

function profile() {
  const definitions = registerAppraiseOperations({
    server: { registerResource: () => ({}), registerTool: () => ({}) } as never,
    api: new Proxy({}, { get: () => async () => ({}) }) as never,
    options: {
      baseUrl: 'http://127.0.0.1:3000',
      coordinatorId: 'p0-r2d-canonical-projection',
      cwd: process.cwd(),
    },
  })
  return createManagedWorkerRegistrationProfile(role, definitions)
}

function digest(value: unknown) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

async function invokeSyntheticGateway(
  toolName: string,
  workerArguments: Record<string, unknown>,
  authority: { attemptId: string; expiresAt: string; profileDigest: string },
) {
  const registration = profile()
  const issuedAt = '2026-09-11T00:00:00.000Z'
  const secret = Buffer.alloc(32, 82)
  const grant = sealManagedWorkerRuntimeGrant(
    {
      attemptId: authority.attemptId,
      authorizationId: 'p0-r2d-authorization',
      expiresAt: authority.expiresAt,
      generation: 0,
      inputHash: digest({ input: 'synthetic' }),
      issuedAt,
      journeyId: 'p0-r2d-journey',
      leaseId: 'p0-r2d-lease',
      profileDigest: authority.profileDigest,
      role,
      scopeHash: digest({ scope: 'synthetic' }),
      target: 'synthetic-target',
      targetProjectId: 'p0-r2d-project',
      workItemId: 'p0-r2d-work-item',
    },
    secret,
  )
  const executed = await executeManagedWorkerGatewayCall({
    arguments: workerArguments,
    authorize: async () => ({ decisionDigest: digest({ decision: 'synthetic-authorized' }) }),
    invoke: async ({ toolName: invokedTool, arguments: invokedArguments }) => ({
      effect: 'synthetic-authorized-effect',
      invocationDigest: digest({ invokedArguments, invokedTool }),
    }),
    profile: registration,
    sealedGrant: grant,
    secret,
    toolName,
  })
  return {
    effect: 'synthetic-authorized-effect',
    profileDigest: registration.contractDigest,
    receiptDigest: digest(executed.receipt),
    resultDigest: digest(executed.result),
  }
}

async function main() {
  const [mode, toolName, encodedArguments, encodedAuthority] = process.argv.slice(2)
  if (mode === 'profile') {
    process.stdout.write(`${JSON.stringify(profile())}\n`)
    return
  }
  if (mode === 'invoke' && toolName && encodedArguments && encodedAuthority) {
    const argumentsValue = JSON.parse(Buffer.from(encodedArguments, 'base64url').toString('utf8'))
    if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) {
      throw new Error('Synthetic gateway arguments must be an object.')
    }
    const authority = JSON.parse(Buffer.from(encodedAuthority, 'base64url').toString('utf8'))
    if (!authority || typeof authority.attemptId !== 'string' || typeof authority.expiresAt !== 'string') {
      throw new Error('Synthetic gateway authority is malformed.')
    }
    process.stdout.write(`${JSON.stringify(await invokeSyntheticGateway(toolName, argumentsValue, authority))}\n`)
    return
  }
  if (mode === 'validate' && toolName && encodedArguments) {
    const registration = profile()
    const tool = registration.tools.find(candidate => candidate.name === toolName)
    if (!tool) throw new Error('Unknown canonical profile tool.')
    const value = JSON.parse(Buffer.from(encodedArguments, 'base64url').toString('utf8'))
    const result = z.fromJSONSchema(tool.inputSchema as never).safeParse(value)
    process.stdout.write(
      `${JSON.stringify({ accepted: result.success, profileDigest: registration.contractDigest })}\n`,
    )
    return
  }
  throw new Error('Expected p0-r2d bridge mode profile or invoke.')
}

void main()
