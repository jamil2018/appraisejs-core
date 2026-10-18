/** Pure disposable T2 configuration correction; no grant, dispatch, or runtime qualification. */
import { casePolicy } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { stableHash } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'

export const SELECTED_PROFILE_APPROVAL_PINS = Object.freeze({
  REQUIREMENT_ANALYZER: Object.freeze({
    sha256: 'sha256:9192817cc1c9e19f62fbefa0167a01982b69f71ce02685f6c4c3e2af650c6f5c',
    names: Object.freeze(['quality_journey_analysis_get', 'quality_journey_external_analyzer_analysis_submit_v1']),
  }),
  SCOUT: Object.freeze({
    sha256: 'sha256:ef401fbd05a42149101ca120eeba521187680194614c520c544a6a22223c9b50',
    names: Object.freeze([
      'quality_journey_discovery_get',
      'quality_journey_external_scout_target_observation_submit_v1',
    ]),
  }),
  RESOURCE_EXPLORER: Object.freeze({
    sha256: 'sha256:92fe623336c8ab8c365a2a5202551f84d4b7b3e8ee30dde390c4acf0f4308cf5',
    names: Object.freeze([
      'quality_journey_discovery_get',
      'operation_search',
      'quality_journey_external_resource_explorer_resolution_submit_v1',
    ]),
  }),
  TEST_SCENARIO_DESIGNER: Object.freeze({
    sha256: 'sha256:18f4129ae471288945ae53874bc50ce2a90ca29823085c8b458b7198eb3169cd',
    names: Object.freeze(['quality_journey_scenarios_get', 'quality_journey_external_scenarios_submit_v1']),
  }),
  AUTOMATOR: Object.freeze({
    sha256: 'sha256:ad57b20ad8ef7f38877966058eaeedaf7e854df0cc1d8e4e36fb13ab0fed37e2',
    names: Object.freeze(['operation_search', 'quality_journey_external_automator_materialize_v1']),
  }),
  TRIAGER: Object.freeze({
    sha256: 'sha256:a4eb8c36e67458424db3822ced7116995219935439b5f0dc238305ecdf620645',
    names: Object.freeze([
      'quality_journey_triage_get',
      'quality_journey_triage_evidence_read',
      'quality_journey_external_triage_submit_v1',
    ]),
  }),
})

const fail = reason => {
  throw new Error(`M02_SELECTED_PROFILE_APPROVAL_${reason}`)
}
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)

// Copy bounded JSON data without evaluating accessors, custom serialization, or inherited members.
function copyJson(value) {
  let nodes = 0
  let chars = 0
  const seen = new Set()
  const visit = (item, depth = 0) => {
    if (++nodes > 20000 || depth > 40) fail('JSON_BOUND')
    if (typeof item === 'string') {
      chars += item.length
      if (chars > 1024 * 1024) fail('JSON_BOUND')
      return item
    }
    if (item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) return item
    if (!item || typeof item !== 'object' || seen.has(item)) fail('JSON_DATA')
    const array = Array.isArray(item)
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) fail('JSON_DATA')
    const fields = Object.getOwnPropertyDescriptors(item)
    const keys = Reflect.ownKeys(fields)
    if (keys.some(key => typeof key !== 'string' || ['__proto__', 'constructor', 'prototype', 'toJSON'].includes(key)))
      fail('JSON_DATA')
    if (array && (fields.length?.value > 20000 || keys.length !== fields.length?.value + 1)) fail('JSON_DATA')
    seen.add(item)
    const entries = []
    for (const key of keys) {
      const field = fields[key]
      if (array && key === 'length') continue
      if (!Object.hasOwn(field, 'value') || !field.enumerable) fail('JSON_DATA')
      entries.push([key, visit(field.value, depth + 1)])
    }
    if (array && entries.some(([key], index) => key !== String(index))) fail('JSON_DATA')
    seen.delete(item)
    return array ? entries.map(([, child]) => child) : Object.fromEntries(entries)
  }
  return visit(value)
}

/** Caller retains genuine seal/file-identity verification; this pure helper pins selected profile content. */
export function applySelectedProfileApprovalPolicy({ caseId, selectedProfile, config }) {
  const item = casePolicy(caseId)
  if (item.phase !== 'T2') fail('CASE')
  // These special cases retain their entire existing configuration and approval semantics byte-for-byte.
  if (caseId === 'P00' || caseId === 'B14') return config
  const profile = copyJson(selectedProfile)
  const pin = SELECTED_PROFILE_APPROVAL_PINS[item.role]
  if (!record(profile) || profile.role !== item.role || profile.gatewayProfile?.role !== item.role) fail('ROLE')
  for (const tools of [profile.gatewayProfile?.tools, profile.advertisedProfile?.tools, profile.toolsList?.tools]) {
    if (
      !Array.isArray(tools) ||
      tools.length !== pin.names.length ||
      new Set(tools.map(tool => tool?.name)).size !== tools.length ||
      tools.some((tool, index) => tool?.name !== pin.names[index])
    )
      fail('MEMBERSHIP')
  }
  if (stableHash(profile) !== pin.sha256) fail('PROFILE_PIN')
  const output = copyJson(config)
  if (
    !record(output) ||
    output.approval_policy !== 'never' ||
    !record(output.mcp_servers) ||
    Object.keys(output.mcp_servers).join(',') !== 'appraise_m02'
  )
    fail('CONFIG')
  const server = output.mcp_servers.appraise_m02
  if (
    !record(server) ||
    Object.keys(server).sort().join(',') !== 'args,command,env,required' ||
    typeof server.command !== 'string' ||
    !server.command.startsWith('/') ||
    !Array.isArray(server.args) ||
    server.args.some(arg => typeof arg !== 'string' || arg.includes('\0')) ||
    server.required !== true ||
    !record(server.env) ||
    Object.values(server.env).some(value => typeof value !== 'string')
  )
    fail('SERVER_OVERRIDES')
  server.tools = Object.fromEntries(pin.names.map(name => [name, { approval_mode: 'approve' }]))
  return output
}
