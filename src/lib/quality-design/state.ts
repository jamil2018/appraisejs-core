import { createHash } from 'node:crypto'

export type RequirementQueryStatus = 'BLOCKING' | 'DEFERRED' | 'ACCEPTED_ASSUMPTION' | 'ANSWERED'

export type AssuranceLevel = 'SMOKE' | 'STANDARD' | 'HIGH' | 'EXHAUSTIVE'

export type EvidenceReceiptHashInput = {
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
  return hashCanonical({
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
    traceHash: input.traceHash ?? null,
    validationVersionHash: input.validationVersionHash,
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
