import { randomUUID } from 'node:crypto'

import prisma from '@/config/db-config'
import { collaborationRecordSchema, type CollaborationRecord } from '@/lib/repository-collaboration/contracts'
import { appendConversationTurn } from '@/services/conversation/conversation-service'
import { connectCollaboration, updateCollaborationPolicy } from '@/services/repository-collaboration/binding-service'
import { prepareCollaborationOperation } from '@/services/repository-collaboration/operation-service'
import { projectSnapshotInTransaction } from '@/services/repository-collaboration/projection-helpers'

async function main() {
  if (!process.env.DATABASE_URL?.startsWith('file:') || process.env.DATABASE_URL.includes('project.db'))
    throw new Error('The collaboration pilot requires a disposable SQLite database.')
  const [mode, projectId, repositoryRoot, conversationId] = process.argv.slice(2)
  if (!mode || !projectId || !repositoryRoot)
    throw new Error('Fixture mode, project and local repository are required.')
  if (mode === 'connect') {
    await prisma.targetProject.update({
      where: { id: projectId },
      data: { canonicalIdentity: `path:${repositoryRoot}`, canonicalPath: repositoryRoot },
    })
    const binding = await connectCollaboration({
      targetProjectId: projectId,
      repositoryRoot,
      trackedBranch: 'appraise-0.5',
      portableProjectId: 'portable-project',
      trustedPrincipalId: 'local-user',
      provenance: 'authenticated-host',
    })
    await updateCollaborationPolicy({
      bindingId: binding.id,
      changes: { INTEGRATE: true, RESOLVE: true, COMMIT: true },
      trustedPrincipalId: 'local-user',
      provenance: 'authenticated-host',
    })
    process.stdout.write(`${binding.id}\n`)
    return
  }
  if (mode !== 'prepare-review' || !conversationId) throw new Error('Unknown fixture mode or missing conversation.')
  const binding = await prisma.collaborationBinding.findUniqueOrThrow({ where: { targetProjectId: projectId } })
  const snapshot = await prisma.$transaction(tx => projectSnapshotInTransaction(tx, binding.id))
  const records = [...snapshot.files]
    .filter(([name]) => name !== 'manifest.json')
    .map(([, content]) => collaborationRecordSchema.parse(JSON.parse(content) as unknown))
  const moduleRecord = records.find(
    (record): record is Extract<CollaborationRecord, { kind: 'module' }> => record.kind === 'module',
  )
  if (!moduleRecord) throw new Error('Fixture lacks a module to make a real conflict.')
  const incoming: CollaborationRecord[] = [
    { ...moduleRecord, payload: { ...moduleRecord.payload, name: `${moduleRecord.payload.name} incoming` } },
  ]
  const prepared = await prepareCollaborationOperation({
    bindingId: binding.id,
    intent: 'RECEIVE',
    idempotencyKey: `e2e-review-${randomUUID()}`,
    expectedPolicyVersion: binding.policyVersion,
    incomingRecords: incoming,
  })
  if (prepared.state !== 'WAITING_FOR_DECISION')
    throw new Error(`Expected a real pending review; observed ${prepared.state}.`)
  await appendConversationTurn({
    targetProjectId: projectId,
    conversationId,
    idempotencyKey: `e2e-link-${randomUUID()}`,
    content: 'Review the prepared receive operation',
    reply: {
      content: 'The exact prepared operation is ready for review.',
      records: [{ kind: 'COLLABORATION', id: prepared.id, title: 'Review collaboration operation' }],
    },
  })
  process.stdout.write(`${prepared.id}\n`)
}

main()
  .catch(error => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
