import { createHash } from 'node:crypto'

const HASH_PATTERN = /^[a-f0-9]{64}$/
const LAUNCH_HASH_FIELDS = ['configurationHash', 'executableHash', 'protocolHash']
const LAUNCH_TEXT_FIELDS = ['launchNonce', 'processId', 'processStartTime']
const REQUIRED_BOUNDARY_FIELDS = ['activePermissionProfile', 'instructionSources', 'runtimeWorkspaceRoots', 'sandbox']

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value))
}

export function canonicalSchemaHash(schema) {
  return sha256(canonicalJson(schema))
}

export function evaluatePreTurnQualification(
  {
    requiredMcpServer: callerRequiredMcpServer,
    mcpServers,
    threadStartResponse,
    sentMethods,
    effectiveManifestEvidence,
    manifestProvenance,
    authoritativeNativeToolInventory,
  } = {},
  { expectedManifest, verifyManifestProvenance } = {},
) {
  const safeSentMethods = Array.isArray(sentMethods) ? sentMethods : []
  const observedMcpNames = Array.isArray(mcpServers) ? mcpServers.map(server => server?.name ?? null) : []
  const findings = [
    ...legacyAuthorityFindings(authoritativeNativeToolInventory, callerRequiredMcpServer),
    ...expectedManifestFindings(expectedManifest),
    ...mcpFindings(expectedManifest?.requiredMcpServer, mcpServers, expectedManifest?.tools),
    ...boundaryFindings(threadStartResponse, expectedManifest),
    ...manifestFindings(effectiveManifestEvidence, expectedManifest),
    ...provenanceFindings({
      effectiveManifestEvidence,
      manifestProvenance,
      mcpServers,
      threadStartResponse,
      sentMethods: safeSentMethods,
      verifyManifestProvenance,
    }),
    ...prematureTurnFindings(safeSentMethods),
  ]

  return {
    qualified: findings.length === 0,
    mayStartTurn: findings.length === 0,
    findings,
    observedMcpNames,
    sentMethods: [...safeSentMethods],
  }
}

function finding(kind, detail) {
  return { id: kind === 'required_mcp_missing' ? 'QB-01' : 'QB-02', kind, detail }
}

function legacyAuthorityFindings(authoritativeNativeToolInventory, callerRequiredMcpServer) {
  const findings = []
  if (authoritativeNativeToolInventory !== undefined) {
    findings.push(
      finding(
        'caller_inventory_authority_rejected',
        'A caller-supplied native inventory flag is not trusted qualification evidence.',
      ),
    )
  }
  if (callerRequiredMcpServer !== undefined) {
    findings.push(
      finding(
        'caller_required_mcp_rejected',
        'The required MCP server must come from the trusted canonical manifest, not provider observations.',
      ),
    )
  }
  return findings
}

function expectedManifestFindings(expectedManifest) {
  if (!isPlainObject(expectedManifest)) {
    return [finding('expected_manifest_unavailable', 'Trusted canonical manifest expectations are unavailable.')]
  }

  const findings = [
    ...toolShapeFindings(expectedManifest.tools, 'expected'),
    ...launchIdentityFindings(expectedManifest.launchIdentity, 'expected'),
    ...boundaryShapeFindings(expectedManifest.boundaryEvidence, 'expected'),
  ]
  if (!nonBlank(expectedManifest.requiredMcpServer)) {
    findings.push(finding('expected_mcp_invalid', 'Trusted canonical manifest omitted the required MCP server.'))
  } else if (Array.isArray(expectedManifest.tools)) {
    for (const tool of expectedManifest.tools) {
      if (tool?.origin !== `mcp:${expectedManifest.requiredMcpServer}`) {
        findings.push(
          finding('expected_tool_origin_invalid', `Expected tool ${tool?.name ?? '<unknown>'} has an invalid origin.`),
        )
      }
    }
  }
  return findings
}

function mcpFindings(requiredMcpServer, mcpServers, expectedTools) {
  if (!Array.isArray(mcpServers)) {
    return [finding('mcp_inventory_invalid', 'MCP server inventory must be an array.')]
  }

  const names = mcpServers.map(server => server?.name)
  const matchingServers = mcpServers.filter(server => server?.name === requiredMcpServer)
  const unexpectedNames = names.filter(name => name !== requiredMcpServer)
  const findings = []

  if (matchingServers.length === 0) {
    findings.push(finding('required_mcp_missing', `Required MCP server ${requiredMcpServer} was not initialized.`))
  }
  if (matchingServers.length > 1) {
    findings.push(finding('duplicate_mcp_server', `Required MCP server ${requiredMcpServer} appeared more than once.`))
  }
  if (unexpectedNames.length > 0) {
    findings.push(
      finding('unexpected_mcp_servers', `Unexpected MCP servers remained visible: ${unexpectedNames.join(', ')}.`),
    )
  }

  const server = matchingServers[0]
  if (server) {
    if (server.status !== 'ready' || server.health !== 'healthy') {
      findings.push(
        finding(
          'required_mcp_not_ready',
          `Required MCP server ${requiredMcpServer} must report status ready and health healthy.`,
        ),
      )
    }
    findings.push(...toolShapeFindings(server.tools, 'mcp'))
    if (Array.isArray(expectedTools) && Array.isArray(server.tools)) {
      findings.push(...exactToolFindings(server.tools, expectedTools, 'mcp'))
    }
  } else {
    for (const observedServer of mcpServers) {
      findings.push(...toolShapeFindings(observedServer?.tools, 'untrusted mcp'))
    }
  }

  return findings
}

function boundaryFindings(threadStartResponse, expectedManifest) {
  if (!isPlainObject(threadStartResponse)) {
    return [finding('startup_receipt_invalid', 'Thread start receipt must be an object.')]
  }

  const expectedBoundary = expectedManifest?.boundaryEvidence
  const findings = boundaryShapeFindings(threadStartResponse, 'observed')
  if (isPlainObject(expectedBoundary) && findings.length === 0) {
    for (const field of REQUIRED_BOUNDARY_FIELDS) {
      if (!canonicalEqual(threadStartResponse[field], expectedBoundary[field])) {
        findings.push(finding('boundary_mismatch', `Thread start boundary ${field} did not match expectations.`))
      }
    }
  }

  if (!isPlainObject(threadStartResponse.thread) || !nonBlank(threadStartResponse.thread.id)) {
    findings.push(finding('thread_identity_invalid', 'Thread start receipt must contain a non-empty thread identity.'))
  }
  if (isPlainObject(expectedBoundary)) {
    findings.push(...launchIdentityFindings(threadStartResponse.launchIdentity, 'observed'))
    if (!canonicalEqual(threadStartResponse.launchIdentity, expectedManifest.launchIdentity)) {
      findings.push(finding('launch_identity_mismatch', 'Thread receipt launch identity did not match expectations.'))
    }
  }

  return findings
}

function boundaryShapeFindings(boundary, source) {
  if (!isPlainObject(boundary)) {
    return [finding('boundary_evidence_invalid', `${source} boundary evidence must be an object.`)]
  }

  const findings = []
  for (const field of REQUIRED_BOUNDARY_FIELDS) {
    if (!(field in boundary) || boundary[field] === null || boundary[field] === undefined) {
      findings.push(finding('boundary_evidence_missing', `${source} boundary evidence omitted ${field}.`))
    }
  }

  if (
    boundary.activePermissionProfile !== undefined &&
    (!isPlainObject(boundary.activePermissionProfile) || !nonBlank(boundary.activePermissionProfile.id))
  ) {
    findings.push(finding('permission_profile_invalid', `${source} permission profile is semantically invalid.`))
  }
  if (
    boundary.instructionSources !== undefined &&
    (!Array.isArray(boundary.instructionSources) || !boundary.instructionSources.every(nonBlank))
  ) {
    findings.push(finding('instruction_sources_invalid', `${source} instruction sources must be an array of paths.`))
  }
  if (
    boundary.runtimeWorkspaceRoots !== undefined &&
    (!Array.isArray(boundary.runtimeWorkspaceRoots) || !boundary.runtimeWorkspaceRoots.every(nonBlank))
  ) {
    findings.push(finding('workspace_roots_invalid', `${source} runtime workspace roots must be an array of paths.`))
  }
  if (
    boundary.sandbox !== undefined &&
    (!isPlainObject(boundary.sandbox) ||
      !nonBlank(boundary.sandbox.type) ||
      typeof boundary.sandbox.networkAccess !== 'boolean')
  ) {
    findings.push(finding('sandbox_evidence_invalid', `${source} sandbox evidence is semantically invalid.`))
  }

  return findings
}

function manifestFindings(effectiveManifestEvidence, expectedManifest) {
  if (!isPlainObject(effectiveManifestEvidence)) {
    return [
      finding(
        'native_tool_inventory_unavailable',
        'No validated effective manifest of model-visible tools was supplied.',
      ),
    ]
  }

  const findings = [
    ...toolShapeFindings(effectiveManifestEvidence.tools, 'effective'),
    ...launchIdentityFindings(effectiveManifestEvidence.launchIdentity, 'effective'),
  ]
  if (isPlainObject(expectedManifest)) {
    if (Array.isArray(effectiveManifestEvidence.tools) && Array.isArray(expectedManifest.tools)) {
      findings.push(...exactToolFindings(effectiveManifestEvidence.tools, expectedManifest.tools, 'effective'))
    }
    if (!canonicalEqual(effectiveManifestEvidence.launchIdentity, expectedManifest.launchIdentity)) {
      findings.push(
        finding('launch_identity_mismatch', 'Effective manifest launch identity did not match expectations.'),
      )
    }
  }

  return findings
}

function toolShapeFindings(tools, source) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return [finding('tool_inventory_empty', `${source} tool inventory must be a non-empty ordered array.`)]
  }

  const findings = []
  const names = new Set()
  for (const [index, tool] of tools.entries()) {
    if (!isPlainObject(tool) || !nonBlank(tool.name) || !nonBlank(tool.origin) || !isPlainObject(tool.inputSchema)) {
      findings.push(finding('tool_definition_invalid', `${source} tool at index ${index} is incomplete.`))
      continue
    }
    if (names.has(tool.name)) {
      findings.push(finding('duplicate_tool', `${source} tool ${tool.name} appeared more than once.`))
    }
    names.add(tool.name)
    let computedHash
    try {
      computedHash = canonicalSchemaHash(tool.inputSchema)
    } catch {
      findings.push(finding('tool_schema_invalid', `${source} tool ${tool.name} has a non-canonical JSON schema.`))
      continue
    }
    if (!HASH_PATTERN.test(tool.schemaHash ?? '') || tool.schemaHash !== computedHash) {
      findings.push(
        finding('tool_schema_hash_mismatch', `${source} tool ${tool.name} schema hash is absent or incorrect.`),
      )
    }
  }
  return findings
}

function exactToolFindings(observedTools, expectedTools, source) {
  const findings = []
  const observedNames = observedTools.map(tool => tool?.name)
  const expectedNames = expectedTools.map(tool => tool?.name)
  const missing = expectedNames.filter(name => !observedNames.includes(name))
  const extra = observedNames.filter(name => !expectedNames.includes(name))

  if (missing.length > 0)
    findings.push(finding('required_tools_missing', `${source} tools omitted: ${missing.join(', ')}.`))
  if (extra.length > 0) findings.push(finding('unexpected_tools', `${source} tools included: ${extra.join(', ')}.`))
  if (missing.length === 0 && extra.length === 0 && !canonicalEqual(observedNames, expectedNames)) {
    findings.push(finding('tool_order_mismatch', `${source} tool order did not match the canonical manifest.`))
  }

  for (const expected of expectedTools) {
    const observed = observedTools.find(tool => tool?.name === expected?.name)
    if (!observed) continue
    if (observed.origin !== expected.origin) {
      findings.push(finding('tool_origin_mismatch', `${source} tool ${expected.name} origin did not match.`))
    }
    if (observed.schemaHash !== expected.schemaHash || !canonicalEqual(observed.inputSchema, expected.inputSchema)) {
      findings.push(finding('tool_schema_mismatch', `${source} tool ${expected.name} schema did not match.`))
    }
  }
  return findings
}

function launchIdentityFindings(identity, source) {
  if (!isPlainObject(identity)) {
    return [finding('launch_identity_invalid', `${source} launch identity must be an object.`)]
  }
  const findings = []
  for (const field of LAUNCH_HASH_FIELDS) {
    if (!HASH_PATTERN.test(identity[field] ?? '')) {
      findings.push(finding('launch_identity_invalid', `${source} launch identity has invalid ${field}.`))
    }
  }
  for (const field of LAUNCH_TEXT_FIELDS) {
    if (!nonBlank(identity[field])) {
      findings.push(finding('launch_identity_invalid', `${source} launch identity has invalid ${field}.`))
    }
  }
  return findings
}

function provenanceFindings({
  effectiveManifestEvidence,
  manifestProvenance,
  mcpServers,
  threadStartResponse,
  sentMethods,
  verifyManifestProvenance,
}) {
  if (typeof verifyManifestProvenance !== 'function') {
    return [finding('manifest_provenance_unavailable', 'Trusted manifest provenance verification is unavailable.')]
  }

  const subject = { effectiveManifestEvidence, mcpServers, sentMethods, threadStartResponse }
  let subjectHash
  try {
    subjectHash = sha256(canonicalJson(subject))
  } catch {
    return [finding('manifest_provenance_invalid', 'Manifest provenance subject is not canonical JSON.')]
  }
  const launchIdentityHash = isPlainObject(effectiveManifestEvidence?.launchIdentity)
    ? sha256(canonicalJson(effectiveManifestEvidence.launchIdentity))
    : null

  let verification
  try {
    verification = verifyManifestProvenance({ manifestProvenance, subject, subjectHash, launchIdentityHash })
  } catch {
    return [finding('manifest_provenance_unverified', 'Trusted manifest provenance verification failed.')]
  }

  let postVerificationHash
  try {
    postVerificationHash = sha256(canonicalJson(subject))
  } catch {
    postVerificationHash = null
  }
  if (postVerificationHash !== subjectHash) {
    return [finding('manifest_evidence_mutated', 'Manifest evidence changed during provenance verification.')]
  }
  if (
    !isPlainObject(verification) ||
    verification.verified !== true ||
    verification.subjectHash !== subjectHash ||
    verification.launchIdentityHash !== launchIdentityHash ||
    !nonBlank(verification.provenanceId)
  ) {
    return [finding('manifest_provenance_unverified', 'Manifest provenance was not verified for this exact launch.')]
  }

  return []
}

function prematureTurnFindings(sentMethods) {
  return sentMethods.includes('turn/start')
    ? [finding('turn_started_before_qualification', 'The harness sent turn/start before the boundary gate passed.')]
    : []
}

function canonicalValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) throw new TypeError('Sparse arrays are not canonical JSON')
    }
    return value.map(canonicalValue)
  }
  if (!isPlainObject(value)) throw new TypeError('Value is not canonical JSON')
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalValue(value[key])]),
  )
}

function canonicalEqual(left, right) {
  try {
    return canonicalJson(left) === canonicalJson(right)
  } catch {
    return false
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function optionalLength(value) {
  return Array.isArray(value) ? value.length : null
}

function optionalThreadIdHash(thread) {
  return thread?.id ? sha256(thread.id) : null
}

export function sanitizeStartupReceipt({ executable, executableHash, protocolHash, response }) {
  return {
    executable,
    executableHash,
    protocolHash,
    activePermissionProfile: response.activePermissionProfile ?? null,
    instructionSourceCount: optionalLength(response.instructionSources),
    runtimeWorkspaceRoots: response.runtimeWorkspaceRoots ?? null,
    sandbox: response.sandbox ?? null,
    threadIdHash: optionalThreadIdHash(response.thread),
  }
}
