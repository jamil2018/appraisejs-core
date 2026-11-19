import type { PrismaClient } from '@prisma/client'
import { createHash } from 'node:crypto'
import { realpath, lstat } from 'node:fs/promises'
import path from 'node:path'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  AssignmentCustodyError,
  type AssignmentCredentialCustody,
  type AssignmentClaimRequest,
  type AssignmentAttemptIdentity,
} from '@/lib/quality-journey/assignment-credential-custody'
import {
  claimExternalQualityJourneyWork,
  admitExternalQualityJourneyWork,
  type ExternalQualityJourneyWorkClaimInput,
  type ExternalQualityJourneySubmissionBinding,
} from './quality-journey-service'
import { readInternalWorkerAuthority } from './quality-journey-internal-worker-authority'

/** Internal application assignment recovery; never provider authentication or a new-attempt scheduler. */
export function createQualityJourneyAssignmentCustodyService(options: {
  custody: AssignmentCredentialCustody
  databaseIdentity: string
  client: PrismaClient
}) {
  const { custody, databaseIdentity, client } = options
  if (!/^sha256:[a-f0-9]{64}$/.test(databaseIdentity)) throw new AssignmentCustodyError('INVALID')
  const prepare = custody.prepare,
    bind = custody.bind,
    recover = custody.withRecovered,
    inspect = custody.inspect
  const query = client.$queryRawUnsafe.bind(client)
  type Physical = Readonly<{ filename: string; device: number; inode: number }>
  let originalPhysical: Promise<Physical> | undefined
  async function readPhysical(): Promise<Physical> {
    try {
      const rows = await query<Array<{ name: string; file: string }>>('PRAGMA database_list')
      const main = rows.filter(row => row.name === 'main')
      if (main.length !== 1 || !path.isAbsolute(main[0].file)) throw new Error()
      const filename = await realpath(main[0].file),
        stat = await lstat(filename)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error()
      return Object.freeze({ filename, device: stat.dev, inode: stat.ino })
    } catch {
      throw new AssignmentCustodyError('CONFLICT')
    }
  }
  async function scope(request: AssignmentClaimRequest) {
    originalPhysical ??= readPhysical()
    const original = await originalPhysical,
      current = await readPhysical()
    if (canonicalContractJson(original) !== canonicalContractJson(current)) throw new AssignmentCustodyError('CONFLICT')
    const effective = `sha256:${createHash('sha256')
      .update(canonicalContractJson({ declared: databaseIdentity, physical: original }))
      .digest('hex')}`
    return { databaseIdentity: effective, claimRequest: request }
  }
  async function prepareOriginal(input: ExternalQualityJourneyWorkClaimInput) {
    const captured = structuredClone(input),
      request = requestOf(captured)
    const result = await prepare(await scope(request), captured.assignmentSecret)
    await scope(request)
    return result
  }
  function requestOf(input: ExternalQualityJourneyWorkClaimInput): AssignmentClaimRequest {
    const request = Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'assignmentSecret'))
    return request as AssignmentClaimRequest
  }
  function bindingOf(
    request: AssignmentClaimRequest,
    assignmentSecret: string,
    attempt: AssignmentAttemptIdentity,
  ): ExternalQualityJourneySubmissionBinding {
    return { ...request, ...attempt, assignmentSecret }
  }
  async function claimOriginal(request: AssignmentClaimRequest, assignmentSecret: string) {
    await scope(request)
    let result
    try {
      result = await claimExternalQualityJourneyWork({ ...request, assignmentSecret }, client)
    } catch {
      throw new AssignmentCustodyError('CLAIM_UNRESOLVED')
    }
    const attempt = {
      workItemId: result.workItem.id,
      attemptId: result.attempt.id,
      assignmentId: result.assignment.assignmentId,
      assignmentGeneration: result.assignmentGeneration,
      leaseId: result.attempt.leaseId,
    }
    const receipt = await bind(await scope(request), attempt)
    return Object.freeze({ receipt, replayed: result.replayed })
  }
  return Object.freeze({
    prepareOriginal,
    async inspectOriginal(request: AssignmentClaimRequest) {
      return inspect(await scope(structuredClone(request)))
    },
    async claimAndBind(input: ExternalQualityJourneyWorkClaimInput) {
      const captured = structuredClone(input),
        request = requestOf(captured)
      await prepareOriginal(captured)
      return claimOriginal(request, captured.assignmentSecret)
    },
    async recoverClaim(request: AssignmentClaimRequest) {
      return recover(await scope(structuredClone(request)), async material =>
        claimOriginal(material.scope.claimRequest, material.assignmentSecret),
      )
    },
    async admitOriginal(request: AssignmentClaimRequest) {
      const captured = structuredClone(request)
      return recover(await scope(captured), async material => {
        if (!material.boundAttempt) throw new AssignmentCustodyError('MISSING')
        const binding = bindingOf(material.scope.claimRequest, material.assignmentSecret, material.boundAttempt)
        const inspected = await inspect(await scope(captured))
        // Stable from authenticated immutable scope: restart cannot choose another admission key.
        const idempotencyKey = `custody-admit:${inspected.entryId.slice(7)}`
        try {
          await scope(captured)
          const result = await admitExternalQualityJourneyWork({ ...binding, idempotencyKey }, client)
          await scope(captured)
          return result
        } catch {
          throw new AssignmentCustodyError('ADMISSION_UNRESOLVED')
        }
      })
    },
    async withRecoveredBinding<T>(
      request: AssignmentClaimRequest,
      use: (binding: Readonly<ExternalQualityJourneySubmissionBinding>) => Promise<T>,
    ): Promise<T> {
      const captured = structuredClone(request)
      return recover(await scope(captured), async material => {
        if (!material.boundAttempt) throw new AssignmentCustodyError('MISSING')
        const binding = bindingOf(material.scope.claimRequest, material.assignmentSecret, material.boundAttempt)
        try {
          await scope(captured)
          await client.$transaction(tx => readInternalWorkerAuthority(binding, tx))
          await scope(captured)
        } catch {
          throw new AssignmentCustodyError('AUTHORITY_REFUSED')
        }
        return use(Object.freeze({ ...binding, principal: Object.freeze({ ...binding.principal }) }))
      })
    },
  })
}
