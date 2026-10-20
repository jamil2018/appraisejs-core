/** Six disposable SDK catalogs. This module never opens a native transport. */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const R4 = join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r4')
const OUTPUT_DIR = join(REPO, '.appraisejs/m02-ta-offline-sdk-profiles-01')
const ROLES = Object.freeze([
  'REQUIREMENT_ANALYZER',
  'SCOUT',
  'RESOURCE_EXPLORER',
  'TEST_SCENARIO_DESIGNER',
  'AUTOMATOR',
  'TRIAGER',
])
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error('non-JSON SDK profile')
  return encoded
}
const digest = value => `sha256:${sha(canonical(value))}`
const ownDir = async path => {
  const state = await fsp.lstat(path)
  if (
    !state.isDirectory() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid() ||
    (state.mode & 0o777) !== 0o700
  )
    throw new Error('disposable offline profile directory identity')
}

function guardEnvironmentReads(root) {
  const sync = ['readFileSync', 'openSync', 'existsSync']
  const async = ['readFile', 'open', 'access']
  const prior = new Map()
  let attempts = 0
  const isEnv = (path, operation) => {
    const value = path instanceof URL ? fileURLToPath(path) : path
    if (operation === 'access' && value === join(root, 'supervisor', 'modules', '.env')) return false
    if (operation === 'existsSync' && typeof value === 'string' && value.startsWith(`${root}/`)) return false
    return typeof value === 'string' && (value === join(REPO, '.env') || value.endsWith('/.env'))
  }
  for (const name of sync) {
    prior.set(`sync:${name}`, fs[name])
    fs[name] = function (path, ...args) {
      if (isEnv(path, name)) {
        attempts++
        throw new Error('offline .env access denied')
      }
      return prior.get(`sync:${name}`).call(this, path, ...args)
    }
  }
  for (const name of async) {
    prior.set(`async:${name}`, fsp[name])
    fsp[name] = async function (path, ...args) {
      if (isEnv(path, name)) {
        attempts++
        throw new Error('offline .env access denied')
      }
      return prior.get(`async:${name}`).call(this, path, ...args)
    }
  }
  return {
    get attempts() {
      return attempts
    },
    restore() {
      for (const name of sync) fs[name] = prior.get(`sync:${name}`)
      for (const name of async) fsp[name] = prior.get(`async:${name}`)
    },
  }
}

function listedToolsOnly(tools) {
  if (!Array.isArray(tools) || !tools.length) throw new Error('SDK tools/list empty')
  return tools.map(tool => {
    if (typeof tool.name !== 'string' || !tool.inputSchema || typeof tool.inputSchema !== 'object')
      throw new Error('SDK tools/list schema missing')
    return {
      name: tool.name,
      ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
      inputSchema: structuredClone(tool.inputSchema),
      ...(tool.outputSchema ? { outputSchema: structuredClone(tool.outputSchema) } : {}),
      inputSchemaDigest: digest(tool.inputSchema),
    }
  })
}

export function validateOfflineRoleProfile(record) {
  if (!ROLES.includes(record?.role) || record?.gatewayProfile?.role !== record.role)
    throw new Error('offline role/profile mismatch')
  const listed = record?.toolsList?.tools
  const advertised = record?.advertisedProfile?.tools
  if (!Array.isArray(listed) || !Array.isArray(advertised) || !listed.length || listed.length !== advertised.length)
    throw new Error('offline SDK catalog cardinality mismatch')
  for (let index = 0; index < listed.length; index++) {
    const item = listed[index]
    const ad = advertised[index]
    if (
      item.name !== ad.name ||
      canonical(item.inputSchema) !== canonical(ad.inputSchema) ||
      item.inputSchemaDigest !== ad.schemaHash ||
      item.inputSchemaDigest !== digest(item.inputSchema)
    )
      throw new Error('offline SDK advertised schema mismatch')
  }
  if (
    record.toolsList.digest !== digest(listed) ||
    !/^sha256:[a-f0-9]{64}$/.test(record.gatewayProfile.profileDigest) ||
    !/^sha256:[a-f0-9]{64}$/.test(record.advertisedProfile.profileDigest)
  )
    throw new Error('offline SDK profile digest mismatch')
  return true
}

async function captureRole({ role, caseId, root, backend, sdkBridge, Client, InMemoryTransport }) {
  const caseRoot = join(root, 'cases', caseId)
  const workspace = join(caseRoot, 'supervisor')
  await fsp.mkdir(caseRoot, { mode: 0o700 })
  await fsp.mkdir(workspace, { mode: 0o700 })
  await ownDir(caseRoot)
  await ownDir(workspace)
  const bridge = backend.createLazyCanonicalSupervisorBridge({
    role,
    workspace,
    caseId,
    onUnknown: () => {
      throw new Error('offline bridge ambiguity')
    },
  })
  const bootstrap = bridge.bootstrapConfig('http://127.0.0.1:44000/m02/canonical')
  const actions = []
  const bridgeClient = sdkBridge.createTrustedWorkerBridgeClient({
    caseId,
    capability: bootstrap.capability,
    exchange: async request => {
      actions.push(request.action)
      return bridge.handle(request)
    },
  })
  let endpoint
  let client
  try {
    endpoint = await sdkBridge.createTrustedWorkerBridgeEndpoint(bridgeClient)
    if (canonical(actions) !== canonical(['bootstrap', 'bindProfile']))
      throw new Error('offline SDK startup action mismatch')
    client = new Client({ name: 'm02-ta-offline-profile', version: '1' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await endpoint.server.connect(serverTransport)
    await client.connect(clientTransport)
    const listed = listedToolsOnly((await client.listTools()).tools)
    const record = {
      role,
      gatewayProfile: structuredClone(endpoint.profile),
      advertisedProfile: structuredClone(endpoint.advertisedProfile),
      toolsList: { tools: listed, digest: digest(listed) },
    }
    validateOfflineRoleProfile(record)
    return record
  } finally {
    try {
      await client?.close()
    } finally {
      try {
        await endpoint?.server.close()
      } finally {
        await bridge.close()
      }
    }
  }
}

export async function collectOfflineSdkProfiles() {
  const root = await fsp.realpath(await fsp.mkdtemp(join(tmpdir(), 'appraise-m02-ta-offline-profiles-')))
  const formerDatabaseUrl = process.env.DATABASE_URL
  const formerNodeEnv = process.env.NODE_ENV
  const guard = guardEnvironmentReads(root)
  try {
    await ownDir(root)
    const [{ prepareT1 }, { stageT1Modules }, { buildT1CanonicalVariant }, { T1_ROOT }] = await Promise.all([
      import(pathToFileURL(join(R4, 't1-runner.mjs')).href),
      import(pathToFileURL(join(R4, 't1-module-stage.mjs')).href),
      import(pathToFileURL(join(R4, 'canonical-variant-build.mjs')).href),
      import(pathToFileURL(join(R4, 'journal.mjs')).href),
    ])
    const prepared = await prepareT1()
    const bundlePin = prepared.manifest.artifacts.find(item => item.purpose === 'canonical-backend')
    if (!bundlePin || bundlePin.sha256 !== sha(await fsp.readFile(bundlePin.path)))
      throw new Error('pinned r4 backend changed')
    const supervisor = join(root, 'supervisor')
    await fsp.mkdir(supervisor, { mode: 0o700 })
    const staged = await stageT1Modules({ prepared, moduleRoot: join(supervisor, 'modules') })
    const variant = await buildT1CanonicalVariant({ root, outputDirectory: join(root, 'variant-build') })
    const p2Bytes = await fsp.readFile(bundlePin.path, 'utf8')
    const variantBytes = await fsp.readFile(variant.bundlePath, 'utf8')
    if (variantBytes.replaceAll(root, T1_ROOT) !== p2Bytes)
      throw new Error('test-root variant is not byte-equivalent to p2 backend')
    await fsp.copyFile(variant.bundlePath, staged.bundlePath)
    if (sha(await fsp.readFile(staged.bundlePath)) !== variant.bundleSha256)
      throw new Error('staged test-root backend changed')
    await fsp.mkdir(join(root, 'cases'), { mode: 0o700 })
    process.env.DATABASE_URL = `file:${join(root, 'supervisor', 'synthetic.db')}`
    process.env.NODE_ENV = 'production'
    const backend = await import(pathToFileURL(staged.bundlePath).href)
    const sdkBridge = await import(
      pathToFileURL(join(REPO, 'packages/appraisejs/dist/mcp/trusted-worker-bridge.js')).href
    )
    const { Client } = await import(
      pathToFileURL(join(REPO, 'packages/appraisejs/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'))
        .href
    )
    const { InMemoryTransport } = await import(
      pathToFileURL(join(REPO, 'packages/appraisejs/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js')).href
    )
    const roles = []
    for (const role of ROLES) {
      const first = await captureRole({
        role,
        caseId: `${role}-A`,
        root,
        backend,
        sdkBridge,
        Client,
        InMemoryTransport,
      })
      const second = await captureRole({
        role,
        caseId: `${role}-B`,
        root,
        backend,
        sdkBridge,
        Client,
        InMemoryTransport,
      })
      if (canonical(first) !== canonical(second)) throw new Error('offline role profile depends on fixture identity')
      roles.push(first)
    }
    if (guard.attempts !== 0) throw new Error('offline environment access attempted')
    const producerPath = fileURLToPath(import.meta.url)
    const sdkPackage = join(REPO, 'packages/appraisejs/node_modules/@modelcontextprotocol/sdk/package.json')
    const result = {
      schema: 'appraise.m02-ta-offline-sdk-profiles/v1',
      evidenceClass: 'OFFLINE_SDK_TOOLS_LIST',
      qualification: 'OFFLINE_ONLY_NOT_NATIVE_CAPTURE_OR_ROUTE',
      provenance: {
        producerSha256: sha(await fsp.readFile(producerPath)),
        sdkPackageSha256: sha(await fsp.readFile(sdkPackage)),
        r4ManifestDigest: prepared.manifestDigest,
        p2BackendSha256: bundlePin.sha256,
        rootTransform: 'TEST_ROOT_VARIANT_BYTE_EQUIVALENT_TO_P2',
        envReadAttempts: guard.attempts,
      },
      roles,
    }
    return Object.freeze(result)
  } finally {
    guard.restore()
    if (formerDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = formerDatabaseUrl
    if (formerNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = formerNodeEnv
    await fsp.rm(root, { recursive: true, force: true })
  }
}

export async function writeOfflineSdkProfiles() {
  const result = await collectOfflineSdkProfiles()
  await fsp.mkdir(OUTPUT_DIR, { mode: 0o700 })
  const path = join(OUTPUT_DIR, 'profiles.json')
  const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`)
  if (bytes.length > 2 * 1024 * 1024) throw new Error('offline SDK profile evidence bound')
  const handle = await fsp.open(
    path,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o600,
  )
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle.close()
  }
  const directory = await fsp.open(
    OUTPUT_DIR,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  )
  try {
    await directory.sync()
  } finally {
    await directory.close()
  }
  return { path, sha256: sha(bytes), roles: result.roles.length, evidenceClass: result.evidenceClass }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3 || process.argv[2] !== '--prepare-offline') {
    process.stderr.write('Exact --prepare-offline invocation required.\n')
    process.exitCode = 1
  } else {
    writeOfflineSdkProfiles().then(
      value => process.stdout.write(`${JSON.stringify(value)}\n`),
      () => {
        process.stderr.write('Offline SDK profile preparation blocked.\n')
        process.exitCode = 1
      },
    )
  }
}
