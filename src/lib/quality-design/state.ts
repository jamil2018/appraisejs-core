import { createHash } from 'node:crypto'

export type RequirementQueryStatus = 'BLOCKING' | 'DEFERRED' | 'ACCEPTED_ASSUMPTION' | 'ANSWERED'

export type AssuranceLevel = 'SMOKE' | 'STANDARD' | 'HIGH' | 'EXHAUSTIVE'

export type EvidenceReceiptHashInput = {
  /** Managed provenance is part of the sealed identity.  These values are
   * intentionally nullable only for historical/standalone call sites; all
   * newly reconciled managed receipts supply the exact durable identities. */
  targetProjectId?: string | null
  assessmentId?: string | null
  assessmentRunId?: string | null
  /** All three are required together for newly sealed managed evidence. They
   * remain absent for historical receipts so their stored v1 hash is never
   * reinterpreted under a new schema. */
  generationId?: string | null
  publicationId?: string | null
  publicationOperationHash?: string | null
  validationVersionHash: string
  resultMatrixCell: string
  subjectDigest: string
  runtimeInputHash: string
  environmentSnapshotHash: string
  browserSnapshotHash?: string
  dataProvenanceHash: string
  outputHash: string
  outcome: string
  reportHash?: string
  logHash?: string
  traceHash?: string
}

export type QualityPlanRevisionHashInput = {
  sourceSpecification: string
  requirementGraph: unknown
  requirements: unknown[]
  obligations: unknown[]
}

const ASSURANCE_RANK: Record<AssuranceLevel, number> = {
  SMOKE: 1,
  STANDARD: 2,
  HIGH: 3,
  EXHAUSTIVE: 4,
}

function canonicalize(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

export function hashCanonical(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`
}

export function hashQualityPlanRevision(input: QualityPlanRevisionHashInput): string {
  return hashCanonical({
    obligations: input.obligations,
    requirementGraph: input.requirementGraph,
    requirements: input.requirements,
    sourceSpecification: input.sourceSpecification,
  })
}

export function canApproveRequirements(queries: { status: RequirementQueryStatus }[]): boolean {
  return queries.every(query => query.status !== 'BLOCKING')
}

export function assuranceSatisfies(observed: AssuranceLevel, required: AssuranceLevel): boolean {
  return ASSURANCE_RANK[observed] >= ASSURANCE_RANK[required]
}

export function hashEvidenceReceipt(input: EvidenceReceiptHashInput): string {
  const publicationIdentity = [input.generationId, input.publicationId, input.publicationOperationHash]
  if (publicationIdentity.some(value => value != null) && publicationIdentity.some(value => !value))
    throw new Error('Evidence publication identity requires generationId, publicationId, and publicationOperationHash.')
  return hashCanonical({
    assessmentId: input.assessmentId ?? null,
    assessmentRunId: input.assessmentRunId ?? null,
    browserSnapshotHash: input.browserSnapshotHash ?? null,
    dataProvenanceHash: input.dataProvenanceHash,
    environmentSnapshotHash: input.environmentSnapshotHash,
    logHash: input.logHash ?? null,
    outcome: input.outcome,
    outputHash: input.outputHash,
    reportHash: input.reportHash ?? null,
    resultMatrixCell: input.resultMatrixCell,
    runtimeInputHash: input.runtimeInputHash,
    subjectDigest: input.subjectDigest,
    targetProjectId: input.targetProjectId ?? null,
    traceHash: input.traceHash ?? null,
    validationVersionHash: input.validationVersionHash,
    ...(input.generationId
      ? {
          generationId: input.generationId,
          publicationId: input.publicationId,
          publicationOperationHash: input.publicationOperationHash,
        }
      : {}),
  })
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson)
  }

  if (!isPlainObject(value)) {
    return value
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJson(child)]),
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
}
