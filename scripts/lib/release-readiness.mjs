import { spawnSync } from 'node:child_process'

const FINDING_IDS = Array.from({ length: 15 }, (_, index) => `A-${String(index + 1).padStart(2, '0')}`)
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low'])
const STATUSES = new Set(['open', 'verified', 'waived'])
const COMMAND_OUTPUT_BUFFER_BYTES = 32 * 1024 * 1024

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function validateWaiver(waiver, findingId, now) {
  const errors = []
  if (!waiver || typeof waiver !== 'object') return [`${findingId}: waived findings require waiver metadata`]

  for (const field of ['owner', 'rationale', 'expiresOn', 'review']) {
    if (!nonEmptyString(waiver[field])) errors.push(`${findingId}: waiver.${field} must be a non-empty string`)
  }

  if (nonEmptyString(waiver.expiresOn)) {
    const expiry = new Date(`${waiver.expiresOn}T23:59:59.999Z`)
    if (Number.isNaN(expiry.valueOf())) errors.push(`${findingId}: waiver.expiresOn must be an ISO date`)
    else if (expiry < now) errors.push(`${findingId}: waiver expired on ${waiver.expiresOn}`)
  }

  return errors
}

function validateStringArray(value, findingId, field, description) {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => !nonEmptyString(item))) {
    return [`${findingId}: ${field} must contain named ${description}`]
  }
  return []
}

function validateFindingIdentity(finding, seen) {
  const errors = []
  const id = finding.id
  if (!FINDING_IDS.includes(id)) errors.push(`${String(id)}: unknown finding id`)
  if (seen.has(id)) errors.push(`${id}: duplicate finding id`)
  seen.add(id)

  return errors
}

function validateFindingOwnership(finding) {
  const errors = []
  const id = finding.id

  if (!SEVERITIES.has(finding.severity)) errors.push(`${id}: invalid severity`)
  if (!nonEmptyString(finding.title)) errors.push(`${id}: title is required`)
  if (!nonEmptyString(finding.owner)) errors.push(`${id}: owner is required`)

  return errors
}

function validateFindingState(finding) {
  const errors = []
  if (!STATUSES.has(finding.status)) errors.push(`${finding.id}: invalid status`)
  if (typeof finding.releaseBlocking !== 'boolean') errors.push(`${finding.id}: releaseBlocking must be boolean`)
  return errors
}

function validateFindingEvidence(finding) {
  return [
    ...validateStringArray(finding.verificationCommands, finding.id, 'verificationCommands', 'commands'),
    ...validateStringArray(finding.requiredEvidence, finding.id, 'requiredEvidence', 'evidence'),
  ]
}

function validateFindingWaiver(finding, now) {
  const id = finding.id
  if (finding.status === 'waived') return validateWaiver(finding.waiver, id, now)
  if (finding.waiver !== undefined) return [`${id}: waiver metadata is only valid for waived findings`]
  return []
}

function validateFinding(finding, { now, seen }) {
  const item = finding && typeof finding === 'object' ? finding : {}
  return [
    ...validateFindingIdentity(item, seen),
    ...validateFindingOwnership(item),
    ...validateFindingState(item),
    ...validateFindingEvidence(item),
    ...validateFindingWaiver(item, now),
  ]
}

export function validateReleaseLedger(ledger, { now = new Date() } = {}) {
  const errors = []
  if (!ledger || typeof ledger !== 'object') return ['ledger must be a JSON object']
  if (ledger.version !== 1) errors.push('ledger.version must be 1')
  if (!Array.isArray(ledger.findings)) return [...errors, 'ledger.findings must be an array']

  const seen = new Set()
  for (const finding of ledger.findings) {
    errors.push(...validateFinding(finding, { now, seen }))
  }

  for (const id of FINDING_IDS) {
    if (!seen.has(id)) errors.push(`${id}: finding is missing`)
  }
  return errors
}

export function evaluateReleaseLedger(ledger, commandResults = []) {
  const blockingFindings = ledger.findings.filter(
    finding =>
      finding.status === 'open' && (finding.releaseBlocking || ledger.blockingSeverities.includes(finding.severity)),
  )
  const failedCommands = commandResults.filter(result => result.status !== 0)
  return {
    ok: blockingFindings.length === 0 && failedCommands.length === 0,
    blockingFindings,
    failedCommands,
  }
}

export function runVerifiedFindingCommands(ledger, { cwd = process.cwd(), runner = spawnSync } = {}) {
  const commands = [
    ...new Set(
      ledger.findings.filter(finding => finding.status === 'verified').flatMap(finding => finding.verificationCommands),
    ),
  ]

  return commands.map(command => {
    const result = runner(command, {
      cwd,
      encoding: 'utf8',
      shell: true,
      stdio: 'pipe',
      maxBuffer: COMMAND_OUTPUT_BUFFER_BYTES,
    })
    return {
      command,
      status: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? result.error?.message ?? '',
    }
  })
}
