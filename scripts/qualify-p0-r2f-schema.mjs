#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { execFile as execFileCallback } from 'node:child_process'

import { inspectProcessIdentity, terminateOwnedProcessGroup } from './lib/managed-journey-isolated-launch.mjs'
import { composeR2dLaunch, canonicalJson, collectBoundedBody, sha256 } from './lib/p0-r2d-interlock-experiment.mjs'

const execFile = promisify(execFileCallback)
export const P0_R2F_BRIDGE = path.resolve('scripts/lib/p0-r2f-profiles.ts')
export const P0_R2F_OUTPUT = '/private/tmp/appraise-p0-r2f-schema.json'
export const P0_R2F_EXECUTABLE =
  '/private/tmp/appraise-codex-0154-npm-cache/_npx/4897a91091a83573/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex'
export const P0_R2F_SOURCE_PATHS = Object.freeze([
  path.resolve('scripts/qualify-p0-r2f-schema.mjs'),
  P0_R2F_BRIDGE,
  path.resolve('scripts/lib/p0-r2d-interlock-experiment.mjs'),
  path.resolve('scripts/lib/managed-journey-isolated-launch.mjs'),
  path.resolve('src/lib/quality-journey/managed-worker-gateway.ts'),
  path.resolve('src/lib/quality-journey/role-definitions.ts'),
  path.resolve('packages/appraisejs/src/mcp/registry.ts'),
  path.resolve('scripts/lib/p0-r2c-dynamic-tools-experiment.mjs'),
  path.resolve('scripts/tests/p0-r2f-schema.test.mjs'),
  '/private/tmp/appraise-codex-0154-source/codex-rs/tools/src/json_schema/types.rs',
  '/private/tmp/appraise-codex-0154-source/codex-rs/tools/src/json_schema/compaction.rs',
  '/private/tmp/appraise-codex-0154-source/codex-rs/app-server/src/request_processors/thread_processor.rs',
])

export function projectResponsesTools(profile) {
  return profile.tools.map(tool => ({
    description: tool.description ?? `Canonical ${tool.name} operation.`,
    name: tool.name,
    parameters: Object.fromEntries(Object.entries(tool.inputSchema).filter(([key]) => key !== '$schema')),
    strict: false,
    type: 'function',
  }))
}

export function buildProbeProfiles() {
  const tool = (name, parameters) => ({
    contractDigest: `p0-r2f-${name}`,
    role: 'SCHEMA_PROBE',
    tools: [{ description: `P0 R2f ${name} schema transport probe.`, inputSchema: parameters, name }],
  })
  const scalar = {
    additionalProperties: false,
    properties: {
      boundedArray: {
        items: { type: 'string' },
        maxItems: 3,
        minItems: 1,
        type: 'array',
      },
      boundedString: {
        maxLength: 7,
        minLength: 2,
        pattern: '^[A-Z]+$',
        type: 'string',
      },
      enumControl: { enum: ['alpha', 'beta'], type: 'string' },
      minItemsControl: { items: { type: 'integer' }, minItems: 1, type: 'array' },
    },
    required: ['boundedString', 'boundedArray', 'enumControl', 'minItemsControl'],
    type: 'object',
  }
  const refObject = {
    additionalProperties: false,
    properties: { payload: { $ref: '#/$defs/payload' } },
    required: ['payload'],
    type: 'object',
  }
  const legacyRefObject = {
    additionalProperties: false,
    properties: { payload: { $ref: '#/definitions/payload' } },
    required: ['payload'],
    type: 'object',
  }
  return [
    { arm: 'probe-inline-constraints', profile: tool('p0_r2f_inline_constraints', scalar) },
    {
      arm: 'probe-defs-ref',
      profile: tool('p0_r2f_defs_ref', {
        ...refObject,
        $defs: { payload: { minLength: 2, pattern: '^[a-z]+$', type: 'string' } },
      }),
    },
    {
      arm: 'probe-allof',
      profile: tool('p0_r2f_allof', {
        additionalProperties: false,
        properties: {
          payload: {
            allOf: [
              { minLength: 2, type: 'string' },
              { maxLength: 7, pattern: '^[a-z]+$', type: 'string' },
            ],
          },
        },
        required: ['payload'],
        type: 'object',
      }),
    },
    {
      arm: 'probe-definitions-ref',
      profile: tool('p0_r2f_definitions_ref', {
        ...legacyRefObject,
        definitions: { payload: { maxItems: 3, minItems: 1, items: { type: 'integer' }, type: 'array' } },
      }),
    },
    { arm: 'probe-compaction-under-budget', profile: tool('p0_r2f_compaction_under_budget', compactionSchema(4_700)) },
    { arm: 'probe-compaction-over-budget', profile: tool('p0_r2f_compaction_over_budget', compactionSchema(5_100)) },
  ]
}

function compactionSchema(descriptionLength) {
  return {
    additionalProperties: false,
    description: `p0-r2f-${'x'.repeat(descriptionLength)}`,
    properties: { value: { description: 'supported nested description', type: 'string' } },
    required: ['value'],
    type: 'object',
  }
}

export function knownSupportedSchema(schema) {
  if (Array.isArray(schema)) return schema.map(knownSupportedSchema)
  if (!schema || typeof schema !== 'object') return schema
  const knownKeys = [
    '$ref',
    'type',
    'description',
    'encrypted',
    'enum',
    'items',
    'minItems',
    'properties',
    'required',
    'additionalProperties',
    'anyOf',
    'oneOf',
    'allOf',
    '$defs',
    'definitions',
  ]
  return Object.fromEntries(
    knownKeys
      .filter(key => Object.hasOwn(schema, key))
      .map(key => {
        const value = schema[key]
        if (key === 'properties' || key === '$defs' || key === 'definitions')
          return [
            key,
            Object.fromEntries(Object.entries(value).map(([name, child]) => [name, knownSupportedSchema(child)])),
          ]
        if (key === 'items' || key === 'additionalProperties') return [key, knownSupportedSchema(value)]
        if (['anyOf', 'oneOf', 'allOf'].includes(key)) return [key, value.map(knownSupportedSchema)]
        return [key, value]
      }),
  )
}

export function schemaByteEvidence(schema) {
  return {
    inputJsonBytes: Buffer.byteLength(JSON.stringify(schema)),
    knownSupportedNormalizedJsonBytes: Buffer.byteLength(JSON.stringify(knownSupportedSchema(schema))),
  }
}

export function collectSchemaDifferences(expected, observed, pathName = '$') {
  const differences = []
  walk(expected, observed, pathName, differences)
  return differences
}

export function summarizeSchemaDifferences(differences) {
  const added = differences.filter(entry => entry.kind === 'added')
  const missing = differences.filter(entry => entry.kind === 'missing')
  const changed = differences.filter(entry => entry.kind === 'changed')
  const semantic = [
    'type',
    'properties',
    'required',
    'minLength',
    'maxLength',
    'pattern',
    'minItems',
    'maxItems',
    'enum',
    '$defs',
    '$ref',
    'allOf',
    'definitions',
    'format',
    'exclusiveMinimum',
    'minimum',
    'maximum',
    'const',
  ]
  return {
    addedCount: added.length,
    changedCount: changed.length,
    missingCount: missing.length,
    missingSemanticFields: Object.fromEntries(
      semantic
        .map(field => [field, missing.filter(entry => entry.field === field).length])
        .filter(([, count]) => count > 0),
    ),
    total: differences.length,
  }
}

export function findSemanticallyEquivalentTransforms(expected, observed, pathName = '$') {
  const transforms = []
  findEquivalences(expected, observed, pathName, transforms)
  return transforms
}

export function evaluateSchemaResearch(results) {
  const findings = []
  const expectedArms = [
    'role-REQUIREMENT_ANALYZER',
    'role-SCOUT',
    'role-RESOURCE_EXPLORER',
    'role-TEST_SCENARIO_DESIGNER',
    'role-AUTOMATOR',
    'role-TRIAGER',
    'probe-inline-constraints',
    'probe-defs-ref',
    'probe-allof',
    'probe-definitions-ref',
    'probe-compaction-under-budget',
    'probe-compaction-over-budget',
  ]
  const observedArms = Array.isArray(results) ? results.map(result => result?.arm) : []
  if (
    !Array.isArray(results) ||
    observedArms.length !== expectedArms.length ||
    new Set(observedArms).size !== expectedArms.length ||
    expectedArms.some(arm => !observedArms.includes(arm))
  )
    findings.push('arm_set_incomplete')
  for (const result of results ?? []) {
    const label = result?.arm ?? 'unknown'
    if (result?.error) findings.push(`${result.arm}:runtime_error`)
    if (result?.capture?.requestCount !== 1) findings.push(`${label}:request_count_invalid`)
    if (result?.capture?.forwardedRequestCount !== 0) findings.push(`${label}:forwarding_observed`)
    if (result?.capture?.responseStatus !== 400) findings.push(`${label}:not_non_forwarding`)
    if (
      result?.capture?.parseValid !== true ||
      result?.capture?.toolsFieldPresent !== true ||
      result?.capture?.toolsArrayValid !== true
    )
      findings.push(`${label}:capture_malformed`)
    if (
      result?.capture?.method !== 'POST' ||
      result?.capture?.path !== '/v1/responses' ||
      result?.capture?.authorization?.present !== true ||
      result?.capture?.authorization?.scheme !== 'Bearer'
    )
      findings.push(`${label}:request_shape_invalid`)
    const expectedNames = result?.capture?.expectedToolNames
    const observedNames = result?.capture?.observedTools?.map(tool => tool?.name)
    if (
      !Array.isArray(expectedNames) ||
      !Array.isArray(observedNames) ||
      observedNames.length !== expectedNames.length ||
      new Set(observedNames).size !== observedNames.length ||
      expectedNames.some(name => !observedNames.includes(name))
    )
      findings.push(`${label}:tool_manifest_invalid`)
    if (
      !Array.isArray(result?.capture?.toolComparisons) ||
      result.capture.toolComparisons.length !== expectedNames?.length ||
      result.capture.toolComparisons.some(comparison => !comparison?.observedDefinitionSha256)
    )
      findings.push(`${label}:comparison_evidence_missing`)
    if (result?.cleanup?.confirmed !== true || result?.cleanup?.survivingProcessCount !== 0)
      findings.push(`${result?.arm ?? 'unknown'}:cleanup_failed`)
    if (result?.canary?.denied !== true) findings.push(`${result?.arm ?? 'unknown'}:seatbelt_canary_failed`)
  }
  return {
    findings: [...new Set(findings)],
    providerQualified: false,
    qualified: false,
    research: true,
  }
}

export async function runQualification({ executable = P0_R2F_EXECUTABLE, outputPath = P0_R2F_OUTPUT } = {}) {
  const profiles = await loadProfiles()
  const rawArms = Object.entries(profiles).map(([role, profile]) => ({ arm: `role-${role}`, profile, role }))
  const results = []
  for (const arm of [...rawArms, ...buildProbeProfiles()]) results.push(await runArm(arm, executable))
  const subject = {
    schema: 'appraise.p0-r2f-schema-transport/v1',
    executable: { path: executable, sha256: sha256(readFileSync(executable)) },
    results,
  }
  const output = {
    ...subject,
    receiptSubjectSha256: sha256(canonicalJson(subject)),
    qualification: evaluateSchemaResearch(results),
  }
  mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 })
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return output
}

async function runArm({ arm, profile, role = null }, executable) {
  const captured = []
  let composition, child, identity, rpc, cleanup, canary
  let error = null
  const requestObserved = deferred()
  const listener = http.createServer((request, response) => {
    void collectBoundedBody(request, 1_000_000)
      .then(body => {
        captured.push(captureRequest(body, request.headers, request.method, request.url))
        response.writeHead(400, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: { message: 'P0 R2f capture endpoint does not forward requests.' } }))
        requestObserved.resolve()
      })
      .catch(cause => {
        error = cause instanceof Error ? cause.message : String(cause)
        response.destroy()
        requestObserved.resolve()
      })
  })
  const forbidden = http.createServer((_request, response) => response.end())
  try {
    await listen(listener)
    await listen(forbidden)
    const port = listener.address().port
    composition = composeR2dLaunch({ executable, gatePort: port, profile })
    const sandboxProfile = `(version 1) (allow default) (deny network*) (allow network-outbound (remote ip "localhost:${port}"))`
    canary = await runSeatbeltCanary(sandboxProfile, forbidden.address().port)
    child = spawn('/usr/bin/sandbox-exec', ['-p', sandboxProfile, composition.executable, ...composition.args], {
      cwd: composition.workingDirectory,
      detached: true,
      env: composition.environment,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    identity = await inspectProcessIdentity(child.pid)
    rpc = createRpc(child)
    await rpc.send('initialize', {
      capabilities: { experimentalApi: true },
      clientInfo: { name: 'appraise-p0-r2f', version: '1' },
    })
    rpc.notify('initialized')
    const resolved = await rpc.send('config/read', { cwd: composition.workingDirectory, includeLayers: true })
    const thread = await rpc.send('thread/start', composition.threadStartParams)
    await rpc.send('turn/start', {
      input: [{ text: 'Emit the declared dynamic tool definitions.', type: 'text' }],
      threadId: thread.thread.id,
    })
    await withTimeout(requestObserved.promise, `${arm}:capture_timeout`, 12_000)
    void resolved
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause)
  } finally {
    rpc?.close()
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => {
        const timer = setTimeout(done, 500)
        function done() {
          clearTimeout(timer)
          child.off('exit', done)
          resolve()
        }
        child.once('exit', done)
      })
    }
    if (child && identity) cleanup = await terminateOwnedProcessGroup(child, identity)
    if (listener.listening) {
      listener.closeAllConnections()
      await close(listener)
    }
    if (forbidden.listening) {
      forbidden.closeAllConnections()
      await close(forbidden)
    }
  }
  const expectedTools = projectResponsesTools(profile)
  const observed = captured[0]?.tools ?? []
  const toolComparisons = expectedTools.map(expected => {
    const actual = observed.find(candidate => candidate?.name === expected.name) ?? null
    const differences = collectSchemaDifferences(expected.parameters, actual?.parameters)
    const semanticallyEquivalentTransforms = findSemanticallyEquivalentTransforms(
      expected.parameters,
      actual?.parameters,
    )
    return {
      expectedDefinitionSha256: sha256(canonicalJson(expected)),
      expectedSchemaSha256: sha256(canonicalJson(expected.parameters)),
      name: expected.name,
      observedDefinitionSha256: actual ? sha256(canonicalJson(actual)) : null,
      observedSchemaSha256: actual?.parameters ? sha256(canonicalJson(actual.parameters)) : null,
      schemaDifferences: differences,
      semanticallyEquivalentTransforms,
      summary: summarizeSchemaDifferences(differences),
    }
  })
  return {
    arm,
    artifactIdentities: {
      configSha256: composition ? sha256(composition.configText) : null,
      executableSha256: sha256(readFileSync(executable)),
      projectionSha256: composition ? sha256(canonicalJson(composition.dynamicTools)) : null,
      sourceSha256: sourceDigests(),
    },
    canary,
    capture: {
      authorization: captured[0]?.authorization ?? { present: false, scheme: null },
      expectedToolNames: expectedTools.map(tool => tool.name),
      forwardedRequestCount: 0,
      method: captured[0]?.method ?? null,
      observedTools: observed,
      path: captured[0]?.path ?? null,
      parseValid: captured[0]?.parseValid ?? false,
      requestCount: captured.length,
      requestSha256: captured[0]?.bodySha256 ?? null,
      responseStatus: captured[0]?.responseStatus ?? null,
      toolsArrayValid: captured[0]?.toolsArrayValid ?? false,
      toolsFieldPresent: captured[0]?.toolsFieldPresent ?? false,
      toolComparisons,
    },
    cleanup: cleanup
      ? { confirmed: cleanup.cleanupConfirmed, survivingProcessCount: cleanup.survivingProcessCount }
      : { confirmed: false, survivingProcessCount: null },
    error,
    expectedTools,
    ...(arm.startsWith('probe-compaction-')
      ? {
          compactionByteEvidence: Object.fromEntries(
            profile.tools.map(tool => [tool.name, schemaByteEvidence(tool.inputSchema)]),
          ),
        }
      : {}),
    role,
  }
}

async function loadProfiles() {
  const { stdout } = await execFile(process.execPath, ['--import', 'tsx', P0_R2F_BRIDGE, 'profiles'], {
    maxBuffer: 4_000_000,
  })
  const profiles = JSON.parse(stdout)
  const roles = ['REQUIREMENT_ANALYZER', 'SCOUT', 'RESOURCE_EXPLORER', 'TEST_SCENARIO_DESIGNER', 'AUTOMATOR', 'TRIAGER']
  if (!profiles || typeof profiles !== 'object' || roles.some(role => !Array.isArray(profiles[role]?.tools)))
    throw new Error('Canonical bridge did not return all six managed-worker profiles.')
  return profiles
}

function captureRequest(body, headers, method, url) {
  let parsed = null
  let parseError = null
  try {
    parsed = JSON.parse(body.toString('utf8'))
  } catch (cause) {
    parseError = cause instanceof Error ? cause.message : String(cause)
  }
  const tools = Array.isArray(parsed?.tools) ? parsed.tools : []
  return {
    authorization: {
      present: typeof headers.authorization === 'string',
      scheme: typeof headers.authorization === 'string' ? headers.authorization.split(/\s+/, 1)[0] : null,
    },
    bodyBytes: body.length,
    bodySha256: sha256(body),
    method,
    parseError,
    parseValid: parsed !== null,
    path: new URL(url, 'http://127.0.0.1').pathname,
    responseStatus: 400,
    tools,
    toolsArrayValid: Array.isArray(parsed?.tools),
    toolsFieldPresent: Boolean(parsed && Object.hasOwn(parsed, 'tools')),
  }
}

function walk(expected, observed, pathName, differences) {
  if (expected === undefined) return
  if (observed === undefined || observed === null) {
    differences.push({ expected, field: lastField(pathName), kind: 'missing', path: pathName })
    return
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(observed)) {
      differences.push({ expected, field: lastField(pathName), kind: 'changed', observed, path: pathName })
      return
    }
    if (expected.length !== observed.length)
      differences.push({
        expected: expected.length,
        field: lastField(pathName),
        kind: 'changed',
        observed: observed.length,
        path: `${pathName}.length`,
      })
    expected.forEach((value, index) => walk(value, observed[index], `${pathName}[${index}]`, differences))
    observed.slice(expected.length).forEach((value, index) =>
      differences.push({
        field: lastField(pathName),
        kind: 'added',
        observed: value,
        path: `${pathName}[${expected.length + index}]`,
      }),
    )
    return
  }
  if (expected && typeof expected === 'object') {
    if (!observed || typeof observed !== 'object' || Array.isArray(observed)) {
      differences.push({ expected, field: lastField(pathName), kind: 'changed', observed, path: pathName })
      return
    }
    for (const [key, value] of Object.entries(expected)) {
      const childPath = `${pathName}.${key}`
      if (!Object.hasOwn(observed, key))
        differences.push({ expected: value, field: key, kind: 'missing', path: childPath })
      else walk(value, observed[key], childPath, differences)
    }
    for (const [key, value] of Object.entries(observed)) {
      if (!Object.hasOwn(expected, key))
        differences.push({ field: key, kind: 'added', observed: value, path: `${pathName}.${key}` })
    }
    return
  }
  if (expected !== observed)
    differences.push({ expected, field: lastField(pathName), kind: 'changed', observed, path: pathName })
}

function findEquivalences(expected, observed, pathName, transforms) {
  if (Array.isArray(expected) && Array.isArray(observed)) {
    expected.forEach((value, index) => findEquivalences(value, observed[index], `${pathName}[${index}]`, transforms))
    return
  }
  if (!expected || typeof expected !== 'object' || !observed || typeof observed !== 'object') return
  if (
    Object.hasOwn(expected, 'const') &&
    Array.isArray(observed.enum) &&
    observed.enum.length === 1 &&
    observed.enum[0] === expected.const
  )
    transforms.push({ kind: 'const_to_single_enum', path: pathName })
  for (const [key, value] of Object.entries(expected)) {
    if (Object.hasOwn(observed, key)) findEquivalences(value, observed[key], `${pathName}.${key}`, transforms)
  }
}

function lastField(pathName) {
  return pathName.replace(/.*[.[]/, '').replace(/]$/, '')
}

function sourceDigests() {
  return Object.fromEntries(P0_R2F_SOURCE_PATHS.map(source => [source, sha256(readFileSync(source))]))
}

function createRpc(child) {
  let nextId = 1
  const pending = new Map()
  const stderr = []
  const rpc = {
    close() {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer)
        entry.reject(new Error('process-closed'))
      }
      pending.clear()
      child.stdin.end()
    },
    notify(method, params = {}) {
      child.stdin.write(`${JSON.stringify({ method, params })}\n`)
    },
    send(method, params) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`${method}:timeout;stderr-lines=${stderr.length}`))
        }, 5_000)
        pending.set(id, { reject, resolve, timer })
        child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
      })
    },
  }
  createInterface({ input: child.stdout }).on('line', line => {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (message.id !== undefined && pending.has(message.id)) {
      const entry = pending.get(message.id)
      pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.error) entry.reject(new Error(`${message.error.code ?? 'rpc'}:${message.error.message ?? 'error'}`))
      else entry.resolve(message.result)
    }
  })
  createInterface({ input: child.stderr }).on('line', line => stderr.push(line.slice(0, 500)))
  return rpc
}

function runSeatbeltCanary(sandboxProfile, forbiddenPort) {
  const probe = [
    "const net = require('node:net')",
    `const socket = net.connect({ host: '127.0.0.1', port: ${forbiddenPort} })`,
    "socket.once('connect', () => process.exit(10))",
    "socket.once('error', error => process.exit(error.code === 'EPERM' || error.code === 'EACCES' ? 0 : 11))",
    'setTimeout(() => process.exit(12), 1000)',
  ].join(';')
  return new Promise(resolve => {
    const child = spawn('/usr/bin/sandbox-exec', ['-p', sandboxProfile, process.execPath, '-e', probe], {
      stdio: 'ignore',
    })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({ denied: false, outcome: 'timeout' })
    }, 1_200)
    child.once('error', () => {
      clearTimeout(timer)
      resolve({ denied: false, outcome: 'spawn_error' })
    })
    child.once('exit', code => {
      clearTimeout(timer)
      resolve({ denied: code === 0, outcome: code === 0 ? 'connection_denied' : `unexpected_exit_${code}` })
    })
  })
}

function deferred() {
  let resolve
  const promise = new Promise(next => {
    resolve = next
  })
  return { promise, resolve }
}

function withTimeout(promise, reason, milliseconds) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(reason)), milliseconds))])
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
}

function close(server) {
  return new Promise(resolve => server.close(() => resolve()))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runQualification().then(output => {
    process.stdout.write(
      `${JSON.stringify({ output: P0_R2F_OUTPUT, receiptSubjectSha256: output.receiptSubjectSha256, qualification: output.qualification })}\n`,
    )
    process.exitCode = 2
  })
}
