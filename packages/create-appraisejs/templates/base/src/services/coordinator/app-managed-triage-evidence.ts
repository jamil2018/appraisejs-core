import { createHash } from 'node:crypto'
import { z } from 'zod'
import { qualityJourneyTriageEvidenceMaxBytes } from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
export const appManagedTriageAssignmentSchema = z
  .object({
    reportRevisionId: z.string().min(1),
    executionCycleId: z.string().min(1),
    cycleId: z.string().min(1),
    inputHash: digest,
    predecessorReport: z
      .object({ reportRevisionId: z.string().min(1) })
      .passthrough()
      .optional(),
    runs: z
      .array(
        z
          .object({
            evidenceReceiptId: z.string().min(1),
            evidence: z
              .object({
                artifacts: z
                  .array(
                    z
                      .object({
                        kind: z.string(),
                        contentHash: digest,
                        size: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
                      })
                      .passthrough(),
                  )
                  .max(512),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1)
      .max(512),
  })
  .passthrough()

const pageSchema = z
  .object({
    receiptId: z.string(),
    artifactKind: z.enum(['report', 'log']),
    contentHash: digest,
    size: z.number().int().min(0).max(qualityJourneyTriageEvidenceMaxBytes),
    offset: z.number().int().min(0),
    endOffset: z.number().int().min(0),
    complete: z.boolean(),
    text: z.string(),
  })
  .passthrough()

type EvidenceCall = (call: {
  toolName: string
  arguments: Record<string, unknown>
  callId: string
}) => Promise<{ result: unknown }>

/** Full, bounded report/log reads through the leased sealed-evidence gateway. No mutable paths or summaries. */
export async function readAppManagedTriageEvidence(
  assignment: z.infer<typeof appManagedTriageAssignmentSchema>,
  invoke: EvidenceCall,
  callPrefix: string,
) {
  const evidence = []
  let bytes = 0
  const seen = new Set<string>()
  for (const run of assignment.runs) {
    for (const artifact of run.evidence.artifacts) {
      if (artifact.kind !== 'report' && artifact.kind !== 'log') continue
      if (artifact.size > qualityJourneyTriageEvidenceMaxBytes)
        throw new ServiceError('Sealed Triager artifact exceeds the canonical read bound.', 'CONFLICT')
      const key = `${run.evidenceReceiptId}:${artifact.kind}`
      if (seen.has(key)) continue
      seen.add(key)
      let offset = 0,
        complete = false
      const pages: string[] = []
      while (!complete) {
        const value = await invoke({
          toolName: 'quality_journey_triage_evidence_read',
          arguments: { receiptId: run.evidenceReceiptId, artifactKind: artifact.kind, offset, limit: 65_536 },
          callId: `${callPrefix}:evidence:${seen.size}:${offset}`,
        })
        const page = pageSchema.parse(value.result)
        if (
          page.receiptId !== run.evidenceReceiptId ||
          page.artifactKind !== artifact.kind ||
          page.contentHash !== artifact.contentHash ||
          page.size !== artifact.size ||
          page.offset !== offset ||
          page.endOffset !== Math.min(offset + 65_536, artifact.size) ||
          page.complete !== (page.endOffset === artifact.size) ||
          (!page.complete && page.endOffset <= offset)
        )
          throw new ServiceError('Sealed Triager text paging changed its frozen descriptor.', 'CONFLICT')
        bytes += Buffer.byteLength(page.text, 'utf8')
        if (bytes > 2_000_000)
          throw new ServiceError('Sealed Triager text exceeds the local request bound.', 'CONFLICT')
        pages.push(page.text)
        offset = page.endOffset
        complete = page.complete
      }
      const text = pages.join('')
      if (
        Buffer.byteLength(text, 'utf8') !== artifact.size ||
        `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}` !== artifact.contentHash
      )
        throw new ServiceError('Sealed triage text could not be reconstructed exactly.', 'CONFLICT')
      evidence.push({
        receiptId: run.evidenceReceiptId,
        artifactKind: artifact.kind,
        contentHash: artifact.contentHash,
        size: artifact.size,
        text,
      })
    }
  }
  return evidence
}
