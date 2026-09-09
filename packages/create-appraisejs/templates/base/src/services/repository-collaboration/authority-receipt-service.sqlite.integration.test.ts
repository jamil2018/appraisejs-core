import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'

import { connectCollaboration, updateCollaborationPolicyWithAuthorityReceipt } from './binding-service'
import { consumeCollaborationAuthorityReceipt, issueCollaborationAuthorityReceipt } from './authority-receipt-service'

const workspaces: string[] = []

afterEach(async () =>
  Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true }))),
)

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-authority-receipt-'))
  workspaces.push(workspace)
  await fs.mkdir(path.join(workspace, '.git'))
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
  const target = await client.targetProject.create({
    data: {
      id: `target-${path.basename(workspace)}`,
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `path:${workspace}`,
      canonicalPath: workspace,
      displayName: 'Authority receipt fixture',
      fingerprint: `sha256:${'a'.repeat(64)}`,
    },
  })
  const binding = await connectCollaboration(
    {
      targetProjectId: target.id,
      repositoryRoot: workspace,
      trackedBranch: 'appraise-0.5',
      trustedPrincipalId: 'local-user',
      provenance: 'local-ui',
    },
    client,
  )
  return { client, binding }
}

describe('collaboration authority receipts', () => {
  it('refuses a receipt-less protected policy update before any policy mutation', async () => {
    const { client, binding } = await fixture()
    try {
      const request = { target: 'target', expectedPolicyVersion: binding.policyVersion, changes: { PUSH: true } }
      await expect(
        updateCollaborationPolicyWithAuthorityReceipt(
          {
            bindingId: binding.id,
            changes: { PUSH: true },
            expectedPolicyVersion: binding.policyVersion,
            authorityReceipt: null,
            request,
          },
          client,
        ),
      ).rejects.toMatchObject({ statusCode: 403 })
      expect((await client.collaborationBinding.findUniqueOrThrow({ where: { id: binding.id } })).policyVersion).toBe(1)
      expect(
        await client.collaborationPolicyGrant.findFirstOrThrow({
          where: { bindingId: binding.id, permission: 'PUSH', policyVersion: 1 },
        }),
      ).toMatchObject({ enabled: false })
    } finally {
      await client.$disconnect()
    }
  })

  it('stores only a hash and consumes one exact request once while returning its stored result on replay', async () => {
    const { client, binding } = await fixture()
    try {
      const request = { target: 'target', expectedPolicyVersion: binding.policyVersion, changes: { INTEGRATE: true } }
      const issued = await issueCollaborationAuthorityReceipt(
        {
          bindingId: binding.id,
          action: 'POLICY_UPDATE',
          expectedPolicyVersion: binding.policyVersion,
          request,
          trustedPrincipalId: 'local-user',
          provenance: 'local-ui',
        },
        client,
      )
      const mutate = async () => ({ policyVersion: 2, trustedPrincipalId: 'local-user' })
      await expect(
        consumeCollaborationAuthorityReceipt(
          { token: issued.token, bindingId: binding.id, action: 'POLICY_UPDATE', request },
          mutate,
          client,
        ),
      ).resolves.toEqual({ policyVersion: 2, trustedPrincipalId: 'local-user' })
      await expect(
        consumeCollaborationAuthorityReceipt(
          { token: issued.token, bindingId: binding.id, action: 'POLICY_UPDATE', request },
          async () => ({ policyVersion: 3 }),
          client,
        ),
      ).resolves.toEqual({ policyVersion: 2, trustedPrincipalId: 'local-user' })
      const stored = await client.collaborationAuthorityReceipt.findFirstOrThrow({ where: { bindingId: binding.id } })
      expect(stored.tokenHash).not.toContain(issued.token)
      await expect(
        consumeCollaborationAuthorityReceipt(
          {
            token: issued.token,
            bindingId: binding.id,
            action: 'POLICY_UPDATE',
            request: { ...request, changes: { PUSH: true } },
          },
          mutate,
          client,
        ),
      ).rejects.toMatchObject({ statusCode: 403 })
    } finally {
      await client.$disconnect()
    }
  })

  it('invalidates a replaced receipt and rejects expired receipts', async () => {
    const { client, binding } = await fixture()
    try {
      const request = { target: 'target', expectedPolicyVersion: binding.policyVersion, changes: { PUSH: true } }
      const first = await issueCollaborationAuthorityReceipt(
        {
          bindingId: binding.id,
          action: 'POLICY_UPDATE',
          expectedPolicyVersion: 1,
          request,
          trustedPrincipalId: 'local-user',
          provenance: 'local-ui',
        },
        client,
      )
      const second = await issueCollaborationAuthorityReceipt(
        {
          bindingId: binding.id,
          action: 'POLICY_UPDATE',
          expectedPolicyVersion: 1,
          request,
          trustedPrincipalId: 'local-user',
          provenance: 'local-ui',
          expiresInMs: 1,
        },
        client,
      )
      await expect(
        consumeCollaborationAuthorityReceipt(
          { token: first.token, bindingId: binding.id, action: 'POLICY_UPDATE', request },
          async () => ({}),
          client,
        ),
      ).rejects.toMatchObject({ statusCode: 403 })
      await new Promise(resolve => setTimeout(resolve, 5))
      await expect(
        consumeCollaborationAuthorityReceipt(
          { token: second.token, bindingId: binding.id, action: 'POLICY_UPDATE', request },
          async () => ({}),
          client,
        ),
      ).rejects.toMatchObject({ statusCode: 403 })
    } finally {
      await client.$disconnect()
    }
  })
})
