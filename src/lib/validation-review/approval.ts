import { createHash } from 'node:crypto'

import type { ReviewArtifact, ValidationArtifact } from '@/lib/plan-contract'

export type ValidationReadiness = {
  ready: boolean
  blockers: string[]
}

function hash(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

export function validationNodeHash(node: ValidationArtifact['validations'][number]): string {
  return hash(node)
}

export function fileReviewHash(file: ValidationArtifact['files'][number]): string {
  return file.contentHash ?? hash({ path: file.path, deleted: true, beforeHash: file.beforeHash })
}

function currentFileApproval(review: ReviewArtifact, file: ValidationArtifact['files'][number]): boolean {
  const currentHash = fileReviewHash(file)
  return Boolean(
    review.fileApprovals.some(approval => approval.path === file.path && approval.contentHash === currentHash),
  )
}

function provenanceBlocker(node: ValidationArtifact['validations'][number]): string | null {
  return node.astProvenance?.schemaVersion === '2'
    ? null
    : `Managed validation ${node.id} is missing exact v2 AST provenance.`
}

export function assessValidationReadiness(validation: ValidationArtifact, review: ReviewArtifact): ValidationReadiness {
  const decisions = new Map(validation.validationDecisions.map(decision => [decision.validationId, decision]))
  const validationBlockers = validation.validations.flatMap(node => {
    const provenanceError = provenanceBlocker(node)
    if (provenanceError) return [provenanceError]
    const decision = decisions.get(node.id)
    const currentDecision = decision?.contentHash === validationNodeHash(node) ? decision : undefined
    if (node.required && currentDecision?.decision !== 'approved') {
      return [`Required validation ${node.id} is not approved for its current content hash.`]
    }
    if (!node.required && !currentDecision) return [`Optional validation ${node.id} needs a current decision.`]
    return []
  })
  const manifest = new Set(validation.manifestPaths)
  const files = new Set(validation.files.map(file => file.path))
  const manifestBlockers = validation.manifestPaths
    .filter(filePath => !files.has(filePath))
    .map(filePath => `Manifest path has no changed-file evidence: ${filePath}`)
  const fileBlockers = validation.files.flatMap(file => {
    const blockers = []
    if (!file.declared) blockers.push(`Undeclared changed file: ${file.path}`)
    const flagged = file.classification === 'production' || file.classification === 'requires_review'
    if (flagged && !currentFileApproval(review, file)) {
      blockers.push(`File ${file.path} requires approval for its current content hash.`)
    }
    if (!manifest.has(file.path)) blockers.push(`Manifest mismatch: ${file.path}`)
    return blockers
  })
  const blockers = [...validationBlockers, ...manifestBlockers, ...fileBlockers]

  return { ready: blockers.length === 0, blockers }
}

export function canModifyDuringValidationPreparation(
  filePath: string,
  classification: ValidationArtifact['files'][number]['classification'],
  contentHash: string,
  review: ReviewArtifact,
): boolean {
  if (classification === 'test_only' || classification === 'test_infrastructure') return true
  return review.fileApprovals.some(approval => approval.path === filePath && approval.contentHash === contentHash)
}
