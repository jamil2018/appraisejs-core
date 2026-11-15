import { OwnedAcquisition } from '../runtime-common.mts'
import type { OwnedEffects } from '../runtime-common.mts'
import type { SpawnedProcess } from '../../../../src/lib/process/task-spawner.ts'
import { B2Transport } from './transport.mjs'
import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  B2Lifetime,
  runB2Protocol,
  assertEligibleAccount,
  renderConfig,
  requiredInputPaths,
  verifyEffectiveConfig,
  verifyManifest,
  verifySourceDescriptor,
} from './runner.mts'
import {
  assertHashInputIsNotCredential,
  createOwnedCredentialLink,
  describeCredentialSource,
  removeOwnedCredentialLink,
  verifyCredentialSource,
  verifyOwnedCredentialLink,
} from './topology.mjs'

function temporary(run: (root: string, source: ReturnType<typeof describeCredentialSource>) => void) {
  const root = mkdtempSync('/private/tmp/m13-b2-source-test-')
  const sourcePath = join(root, 'synthetic-auth.json')
  writeFileSync(sourcePath, 'synthetic secret bytes only', { mode: 0o600 })
  try {
    run(root, describeCredentialSource(sourcePath))
  } finally {
    rmSync(root, { recursive: true })
  }
}

test('synthetic credential metadata and newly owned link verify without reading credential bytes', () =>
  temporary((root, source) => {
    const before = lstatSync(source.path, { bigint: true })
    const link = createOwnedCredentialLink(source, join(root, 'new-auth.json'))
    assert.deepEqual(verifyOwnedCredentialLink(link), link)
    assert.deepEqual(verifyCredentialSource(source), source)
    removeOwnedCredentialLink(link)
    assert.equal(existsSync(link.path), false)
    const after = lstatSync(source.path, { bigint: true })
    assert.equal(after.ino, before.ino)
    assert.equal(after.size, before.size)
    assert.equal(after.mtimeNs, before.mtimeNs)
    assert.equal(after.ctimeNs, before.ctimeNs)
  }))

test('preexisting link is never replaced and changed/replaced links are never removed', () =>
  temporary((root, source) => {
    const path = join(root, 'new-auth.json')
    const original = createOwnedCredentialLink(source, path)
    assert.throws(() => createOwnedCredentialLink(source, path), { code: 'EEXIST' })
    renameSync(path, join(root, 'old-link'))
    symlinkSync(source.path, path)
    assert.throws(() => removeOwnedCredentialLink(original), { category: 'credential_link_replaced' })
    assert.equal(lstatSync(path).isSymbolicLink(), true)
    unlinkSync(path)
    writeFileSync(path, 'synthetic replacement', { mode: 0o600 })
    assert.throws(() => removeOwnedCredentialLink(original), { category: 'credential_link_replaced' })
    assert.equal(lstatSync(path).isFile(), true)
  }))

test('source metadata changes, symlink sources and relaxed permissions refuse without restoring anything', () =>
  temporary((root, source) => {
    chmodSync(source.path, 0o644)
    assert.throws(() => verifyCredentialSource(source), { category: 'credential_source_permissions_refused' })
    assert.equal(Number(lstatSync(source.path).mode & 0o777), 0o644)
    chmodSync(source.path, 0o600)
    writeFileSync(source.path, 'different synthetic data')
    assert.throws(() => verifyCredentialSource(source), { category: 'credential_source_metadata_changed' })
    const alias = join(root, 'alias')
    symlinkSync(source.path, alias)
    assert.throws(() => describeCredentialSource(alias), { category: 'credential_source_type_refused' })
  }))

test('credential path, symlink aliases and hard-link aliases are excluded from hashing inputs', () =>
  temporary((root, source) => {
    assert.throws(() => assertHashInputIsNotCredential(source.path, source), {
      category: 'credential_hash_input_refused',
    })
    const alias = join(root, 'alias')
    symlinkSync(source.path, alias)
    assert.throws(() => assertHashInputIsNotCredential(alias, source), { category: 'credential_hash_input_refused' })
    const hardAlias = join(root, 'hard-alias')
    linkSync(source.path, hardAlias)
    assert.throws(() => assertHashInputIsNotCredential(hardAlias, source), {
      category: 'credential_hash_input_refused',
    })
  }))

test('config uses explicit file backend and no MCP or provider environment settings', () => {
  const config = renderConfig()
  assert.match(config, /cli_auth_credentials_store = "file"/)
  assert.match(config, /\[features\]\nhooks = false\nremote_plugin = false\n/)
  assert.match(config, /\[mcp_servers\]\n$/)
  assert.doesNotMatch(config, /keyring|auto|api_key|token|url/)
  const paths = requiredInputPaths('/frozen/schema')
  assert.equal(paths.filter(path => path.startsWith('/frozen/schema/')).length, 10)
  assert.equal(new Set(paths).size, paths.length)
  assert.equal(
    paths.some(path => path.endsWith('/auth.json')),
    false,
  )
})
function publicConfig() {
  return {
    config: {
      model: 'gpt-6.1-sol',
      model_reasoning_effort: 'medium',
      approval_policy: 'never',
      sandbox_mode: 'read-only',
      analytics: { enabled: false },
      features: { hooks: false, remote_plugin: false },
    } as Record<string, unknown>,
    origins: {},
  }
}
test('declared config projection matches while omitted private fields remain unattested', () => {
  assert.doesNotThrow(() => verifyEffectiveConfig(publicConfig()))
  const projected = publicConfig()
  Object.assign(projected.config, { cli_auth_credentials_store: 'file', mcp_servers: {}, model_provider: 'openai' })
  assert.doesNotThrow(() => verifyEffectiveConfig(projected))
  for (const [key, value] of [
    ['cli_auth_credentials_store', 'auto'],
    ['mcp_servers', { unexpected: {} }],
    ['hooks', ['command']],
    ['http_headers', { authorization: 'synthetic-secret' }],
    ['base_url', 'https://unapproved.invalid'],
  ] as const) {
    const changed = publicConfig()
    changed.config[key] = value
    assert.throws(() => verifyEffectiveConfig(changed), { category: 'CONFIGURATION_UNVERIFIED' })
  }
  const provider = publicConfig()
  provider.config.model_provider = 'unexpected'
  assert.throws(() => verifyEffectiveConfig(provider), { category: 'UNEXPECTED_PROVIDER_AUTH' })
})

test('only present ChatGPT account on the expected auth-requiring provider passes', () => {
  assert.doesNotThrow(() => assertEligibleAccount({ accountType: 'chatgpt', present: true, requiresOpenaiAuth: true }))
  for (const [type, present, required, category] of [
    ['missing', false, true, 'AUTHENTICATION_REQUIRED'],
    ['apiKey', true, true, 'API_KEY_AUTH_REFUSED'],
    ['amazonBedrock', true, false, 'UNEXPECTED_PROVIDER_AUTH'],
    ['gcp', true, false, 'UNEXPECTED_PROVIDER_AUTH'],
    ['chatgpt', true, false, 'UNEXPECTED_PROVIDER_AUTH'],
  ] as const)
    assert.throws(() => assertEligibleAccount({ accountType: type, present, requiresOpenaiAuth: required }), {
      category,
    })
})

test('manifest mismatch and synthetic descriptor refuse before any real-source metadata access', () =>
  temporary((root, source) => {
    const path = join(root, 'manifest.json')
    writeFileSync(path, '{}')
    assert.throws(() => verifyManifest(path, '0'.repeat(64), syntheticManifestReads()), {
      category: 'manifest_hash_mismatch',
    })
    assert.throws(() => verifySourceDescriptor(source), { category: 'credential_descriptor_refused' })
  }))

test('feature controls require explicit false values and arbitrary plugin or hook booleans remain refused', () => {
  for (const value of [undefined, null, false, [], 'false']) {
    const response = publicConfig()
    if (value === undefined) delete response.config.features
    else response.config.features = value
    assert.throws(() => verifyEffectiveConfig(response), { category: 'CONFIGURATION_UNVERIFIED' })
  }
  for (const key of ['hooks', 'remote_plugin']) {
    for (const value of [undefined, true, 'false', null, 0]) {
      const response = publicConfig()
      const features = response.config.features as Record<string, unknown>
      if (value === undefined) delete features[key]
      else features[key] = value
      assert.throws(() => verifyEffectiveConfig(response), { category: 'CONFIGURATION_UNVERIFIED' })
    }
  }
  const harmless = publicConfig()
  Object.assign(harmless.config.features as Record<string, unknown>, {
    harmless_feature: true,
    unknown_plugin: false,
    unknown_hook: false,
  })
  assert.doesNotThrow(() => verifyEffectiveConfig(harmless))
  for (const key of ['unknown_plugin', 'unknown_hook', 'plugins', 'capabilities']) {
    const response = publicConfig()
    ;(response.config.features as Record<string, unknown>)[key] = true
    assert.throws(() => verifyEffectiveConfig(response), { category: 'CONFIGURATION_UNVERIFIED' })
  }
})

test('B1 empty-whitelist projection rule never permits any B2 MCP server', () => {
  for (const envVars of [undefined, [], null, 'unexpected', ['UNAPPROVED']]) {
    const response = publicConfig()
    response.config.mcp_servers = { m13_b1_fixture: envVars === undefined ? {} : { env_vars: envVars } }
    assert.throws(() => verifyEffectiveConfig(response), { category: 'CONFIGURATION_UNVERIFIED' })
  }
})

function approvedDescriptor() {
  return {
    path: '/Users/jamil/.codex/auth.json',
    canonicalPath: '/Users/jamil/.codex/auth.json',
    uid: '503',
    mode: '384',
    dev: '16777229',
    ino: '89690255',
    nlink: '1',
    size: '100',
    mtimeNs: '1000',
    ctimeNs: '1000',
  }
}
function syntheticManifestReads(): NonNullable<Parameters<typeof verifyManifest>[2]> {
  return {
    describeSource: () => approvedDescriptor(),
    canonicalPath: () => '/synthetic/manifest.json',
    identity: () => ({ dev: 1n, ino: 2n }),
    readBytes: () => Buffer.from('{}'),
  }
}

test('only the approved current device and exact fixed credential identity are accepted', () => {
  assert.doesNotThrow(() => verifySourceDescriptor(approvedDescriptor()))
  for (const [key, value] of [
    ['dev', '16777231'],
    ['ino', '13904960'],
    ['uid', '504'],
    ['mode', '420'],
    ['nlink', '2'],
    ['canonicalPath', '/synthetic/other-auth.json'],
    ['path', '/synthetic/other-auth.json'],
    ['dev', 16777230],
  ] as const) {
    assert.throws(() => verifySourceDescriptor({ ...approvedDescriptor(), [key]: value }), {
      category: 'credential_descriptor_refused',
    })
  }
})

test('the old credential tuple refuses before every manifest metadata and byte read', () => {
  const io = syntheticManifestReads()
  const calls: string[] = []
  io.describeSource = () => ({ ...approvedDescriptor(), dev: '16777230', ino: '13904959' })
  io.canonicalPath = () => {
    calls.push('canonicalPath')
    return '/synthetic/manifest.json'
  }
  io.identity = () => {
    calls.push('identity')
    return { dev: 1n, ino: 2n }
  }
  io.readBytes = () => {
    calls.push('readBytes')
    return Buffer.from('{}')
  }
  assert.throws(() => verifyManifest('/synthetic/manifest.json', '0'.repeat(64), io), {
    category: 'credential_descriptor_refused',
  })
  assert.deepEqual(calls, [])
})

test('fixed source metadata or source-type refusal precedes every manifest metadata and byte read', () => {
  for (const [key, value] of Object.entries({
    dev: '16777231',
    ino: '13904960',
    uid: '504',
    mode: '420',
    nlink: '2',
    canonicalPath: '/synthetic/changed-auth.json',
  })) {
    const io = syntheticManifestReads()
    const calls: string[] = []
    io.describeSource = () => ({ ...approvedDescriptor(), [key]: value })
    io.canonicalPath = () => {
      calls.push('canonicalPath')
      return '/synthetic/manifest.json'
    }
    io.identity = () => {
      calls.push('identity')
      return { dev: 1n, ino: 2n }
    }
    io.readBytes = () => {
      calls.push('readBytes')
      return Buffer.from('{}')
    }
    assert.throws(() => verifyManifest('/synthetic/manifest.json', '0'.repeat(64), io), {
      category: 'credential_descriptor_refused',
    })
    assert.deepEqual(calls, [])
  }
  const io = syntheticManifestReads()
  io.describeSource = () => {
    throw Object.assign(new Error('synthetic_source_type'), { category: 'credential_source_type_refused' })
  }
  io.readBytes = () => {
    assert.fail('source type refusal must prevent manifest bytes from being read')
  }
  assert.throws(() => verifyManifest('/synthetic/manifest.json', '0'.repeat(64), io), {
    category: 'credential_source_type_refused',
  })
})

test('direct, canonical and same-identity credential aliases never reach manifest byte reads', () => {
  for (const kind of ['direct', 'canonical', 'identity']) {
    const io = syntheticManifestReads()
    const calls: string[] = []
    io.describeSource = path => {
      calls.push(path)
      return approvedDescriptor()
    }
    if (kind !== 'identity') io.canonicalPath = () => approvedDescriptor().canonicalPath
    else io.identity = () => ({ dev: 16777229n, ino: 89690255n })
    io.readBytes = path => {
      assert.fail(`secret alias must never be read: ${path}`)
    }
    const manifestPath = kind === 'direct' ? approvedDescriptor().path : '/synthetic/alias.json'
    assert.throws(() => verifyManifest(manifestPath, '0'.repeat(64), io), {
      category: 'credential_hash_input_refused',
    })
    assert.deepEqual(calls, [approvedDescriptor().path])
  }
})

function fakeB2Ownership(failStop = false) {
  const calls: string[] = []
  const original = {
    process: {
      connected: true,
      disconnect: () => {
        calls.push('disconnect')
      },
    },
  } as unknown as SpawnedProcess
  const observation = {
    kind: 'group_exit_observed' as const,
    groupId: 321,
    observedAt: 'synthetic',
    supervisorProtocol: 'appraise.owned-supervisor/v1' as const,
    runtimeBrowserCleanup: 'NOT_REQUIRED' as const,
  }
  const effects: OwnedEffects = {
    acquire: async () => original,
    stop: async handle => {
      assert.equal(handle, original)
      calls.push('physical-stop')
      if (failStop) throw new Error('synthetic-stop-refused')
      return observation
    },
  }
  return { calls, observation, owned: new OwnedAcquisition(effects) }
}
async function syntheticCredentialLifetime(
  run: (root: string, source: ReturnType<typeof describeCredentialSource>) => Promise<void>,
) {
  const root = mkdtempSync('/private/tmp/m13-b2-lifetime-source-')
  const path = join(root, 'synthetic-secret.json')
  writeFileSync(path, 'synthetic only', { mode: 0o600 })
  try {
    await run(root, describeCredentialSource(path))
  } finally {
    rmSync(root, { recursive: true })
  }
}
test('B2 physical observation precedes refused drain, metadata verification, and exact owned-link removal', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  return syntheticCredentialLifetime(async (root, source) => {
    const fake = fakeB2Ownership()
    await fake.owned.acquire('synthetic-only', [], { supervisorPath: '/synthetic', cwd: '/synthetic', env: {} })
    const events: { category: string }[] = []
    const state = new B2Lifetime(event => events.push(event), fake.owned)
    state.link = createOwnedCredentialLink(source, join(root, 'new-auth.json'))
    state.transport = {
      waitForDrain: async () => {
        fake.calls.push('drain')
        throw new Error('synthetic-drain-refused')
      },
    } as unknown as B2Transport
    try {
      await state.cleanup()
      assert.deepEqual(fake.calls, ['physical-stop', 'drain'])
      assert.equal(state.cleaned, true)
      assert.equal(state.physicalCleanup, fake.observation)
      assert.equal(lstatSync(state.link.path).isSymbolicLink(), true)
      state.finalizeCredential(source)
      assert.deepEqual(
        events.map(event => event.category),
        [
          'owned_group_exit_observed',
          'cleanup_protocol_refused',
          'credential_metadata_unchanged',
          'owned_credential_link_removed',
        ],
      )
      assert.equal(state.result().disposition, 'PARKED')
      assert.equal(existsSync(state.link.path), false)
      assert.deepEqual(verifyCredentialSource(source), source)
    } finally {
      clearTimeout(state.hardTimer)
      clearTimeout(state.workTimer)
    }
  })
})
test('B2 UNKNOWN cleanup retains its owned link and never reaches credential metadata or removal', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const exit = new Error('synthetic-exit')
  t.mock.method(process, 'exit', () => {
    throw exit
  })
  return syntheticCredentialLifetime(async (root, source) => {
    const fake = fakeB2Ownership(true)
    await fake.owned.acquire('synthetic-only', [], { supervisorPath: '/synthetic', cwd: '/synthetic', env: {} })
    const events: { category: string }[] = []
    const state = new B2Lifetime(event => events.push(event), fake.owned)
    state.link = createOwnedCredentialLink(source, join(root, 'new-auth.json'))
    try {
      await assert.rejects(state.cleanup(), error => error === exit)
      state.finalizeCredential(source)
      assert.equal(state.cleaned, false)
      assert.equal(state.metadataVerified, false)
      assert.equal(state.linkRemoved, false)
      assert.equal(lstatSync(state.link.path).isSymbolicLink(), true)
      assert.deepEqual(fake.calls, ['physical-stop', 'disconnect'])
      assert.deepEqual(
        events.map(event => event.category),
        ['cleanup_unknown'],
      )
    } finally {
      clearTimeout(state.hardTimer)
      clearTimeout(state.workTimer)
    }
  })
})
test('B2 replacement credential link remains untouched after observed cleanup', () =>
  syntheticCredentialLifetime(async (root, source) => {
    const state = new B2Lifetime(() => {})
    state.link = createOwnedCredentialLink(source, join(root, 'new-auth.json'))
    renameSync(state.link.path, join(root, 'original-link'))
    symlinkSync(source.path, state.link.path)
    state.cleaned = true
    try {
      state.finalizeCredential(source)
      assert.equal(state.metadataVerified, false)
      assert.equal(state.linkRemoved, false)
      assert.equal(state.failure, 'credential_metadata_or_link_changed')
      assert.equal(lstatSync(state.link.path).isSymbolicLink(), true)
    } finally {
      clearTimeout(state.hardTimer)
      clearTimeout(state.workTimer)
    }
  }))
test('B2 finite protocol observes the mandatory reduced account response and emits no extra RPC', async () => {
  const root = mkdtempSync('/private/tmp/m13-b2-protocol-source-')
  mkdirSync(join(root, 'codex-home'))
  const calls: string[] = []
  const account = { accountType: 'chatgpt', present: true, requiresOpenaiAuth: true }
  const client = {
    initialize: async () => {
      calls.push('initialize')
      return { codexHome: join(root, 'codex-home') }
    },
    configRead: async () => {
      calls.push('config')
      return publicConfig()
    },
    accountRead: async () => {
      calls.push('account')
      return account
    },
    assertHealthy: () => {
      calls.push('healthy')
    },
  }
  let observed: unknown
  try {
    await runB2Protocol(
      client,
      root,
      () => {},
      value => {
        observed = value
      },
    )
    assert.equal(observed, account)
    assert.deepEqual(calls, ['initialize', 'config', 'account', 'healthy'])
  } finally {
    rmSync(root, { recursive: true })
  }
})
