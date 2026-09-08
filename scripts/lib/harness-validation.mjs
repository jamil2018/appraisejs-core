import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { spawnSync } from 'node:child_process'
import YAML from 'yaml'
import { cucumberRuntimeArtifactFingerprint, cucumberRuntimeInputFingerprint } from './cucumber-runtime-fingerprint.mjs'

const CODE_ANALYSIS_COMMANDS = new Set(['fallow-commit', 'react-doctor-commit'])
const VALID_STAGES = new Set(['local', 'pre-commit', 'ci'])

export function readValidationRegistry(root) {
  const registryPath = path.join(root, 'config/development-harness/validation-registry.json')
  return validateValidationRegistry(JSON.parse(readFileSync(registryPath, 'utf8')))
}

export function validateValidationRegistry(registry) {
  if (!registry || registry.version !== 1) throw new Error('Validation registry must declare version 1.')
  for (const key of ['commands', 'surfaces', 'prerequisites']) {
    if (!Array.isArray(registry[key])) throw new Error(`Validation registry ${key} must be an array.`)
  }
  const commandIds = uniqueIds(registry.commands, 'command')
  const prerequisiteIds = uniqueIds(registry.prerequisites, 'prerequisite')
  for (const command of registry.commands) {
    if (!Array.isArray(command.command) || command.command.length < 2) {
      throw new Error(`Validation command ${command.id} must provide an executable command.`)
    }
    if (!command.stages?.every(stage => VALID_STAGES.has(stage))) {
      throw new Error(`Validation command ${command.id} has an unsupported stage.`)
    }
    assertBounded(command, `Validation command ${command.id}`)
    if (command.ciCommand && !command.ciJob)
      throw new Error(`Validation command ${command.id} requires ciJob coverage.`)
    for (const prerequisite of command.prerequisites ?? []) {
      if (!prerequisiteIds.has(prerequisite))
        throw new Error(`Validation command ${command.id} references ${prerequisite}.`)
    }
  }
  for (const prerequisite of registry.prerequisites)
    assertBounded(prerequisite, `Validation prerequisite ${prerequisite.id}`)
  for (const surface of registry.surfaces) {
    if (!surface.id || !Array.isArray(surface.patterns) || !Array.isArray(surface.commands)) {
      throw new Error('Validation surfaces require id, patterns, and commands.')
    }
    for (const command of surface.commands) {
      if (!commandIds.has(command)) throw new Error(`Validation surface ${surface.id} references ${command}.`)
    }
  }
  return registry
}

function uniqueIds(items, label) {
  const ids = new Set()
  for (const item of items) {
    if (!item?.id || ids.has(item.id)) throw new Error(`Validation ${label} ids must be unique and non-blank.`)
    ids.add(item.id)
  }
  return ids
}

function assertBounded(item, label) {
  if (!Number.isInteger(item.timeoutMs) || item.timeoutMs < 1 || item.timeoutMs > 600000) {
    throw new Error(`${label} timeoutMs must be between 1 and 600000.`)
  }
  if (!Number.isInteger(item.retryLimit) || item.retryLimit < 0 || item.retryLimit > 2) {
    throw new Error(`${label} retryLimit must be between 0 and 2.`)
  }
}

export function parseNameStatus(output) {
  const fields = output.split('\0').filter(Boolean)
  const changes = []
  for (let index = 0; index < fields.length; index += 1) {
    const status = fields[index]
    if (/^R|^C/.test(status)) {
      changes.push({ status: status[0], oldPath: fields[index + 1], path: fields[index + 2] })
      index += 2
    } else {
      changes.push({ status: status[0], path: fields[index + 1] })
      index += 1
    }
  }
  return changes.filter(change => change.path)
}

export function collectGitChanges(root, run = runGit) {
  const combined = [
    ...parseNameStatus(run(root, ['diff', '--name-status', '-z'])),
    ...parseNameStatus(run(root, ['diff', '--cached', '--name-status', '-z'])),
    ...run(root, ['ls-files', '--others', '--exclude-standard', '-z'])
      .split('\0')
      .filter(Boolean)
      .map(pathname => ({ status: 'U', path: pathname })),
  ]
  const byIdentity = new Map()
  for (const change of combined) byIdentity.set(`${change.status}:${change.oldPath ?? ''}:${change.path}`, change)
  return [...byIdentity.values()]
}

function runGit(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10000 })
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr ?? 'Unable to read Git changes.')
  return result.stdout
}

export function isDocumentationOnlyChange(changes, registry) {
  const paths = changes.flatMap(change => [change.oldPath, change.path].filter(Boolean))
  return (
    paths.length > 0 &&
    paths.every(pathname => isDocumentationPath(pathname, registry) && !isSharedConfigurationPath(pathname, registry))
  )
}

function isDocumentationPath(pathname, registry) {
  return registry.documentationPatterns.some(pattern => matchesPattern(pathname, pattern))
}

function isSharedConfigurationPath(pathname, registry) {
  return registry.sharedConfigurationPatterns.some(pattern => matchesPattern(pathname, pattern))
}

export function createValidationPlan({ registry, changes, stage }) {
  if (!VALID_STAGES.has(stage)) throw new Error(`Unsupported validation stage: ${stage}`)
  const paths = changes.flatMap(change => [change.oldPath, change.path].filter(Boolean))
  const unknownOrShared = paths.some(
    pathname => isSharedConfigurationPath(pathname, registry) || !matchesAnySurface(pathname, registry),
  )
  const selectedSurfaces = unknownOrShared
    ? registry.surfaces.map(surface => surface.id)
    : registry.surfaces
        .filter(surface => paths.some(pathname => surface.patterns.some(pattern => matchesPattern(pathname, pattern))))
        .map(surface => surface.id)
  const surfaceCommands = new Set(
    registry.surfaces.filter(surface => selectedSurfaces.includes(surface.id)).flatMap(surface => surface.commands),
  )
  const documentationOnly = isDocumentationOnlyChange(changes, registry)
  const commands = registry.commands.filter(command => {
    const selected = stage === 'ci' ? command.stages.includes('ci') : surfaceCommands.has(command.id)
    if (!selected || !command.stages.includes(stage)) return false
    return !documentationOnly || !CODE_ANALYSIS_COMMANDS.has(command.id)
  })
  return { stage, changes, paths, selectedSurfaces, documentationOnly, broadened: unknownOrShared, commands }
}

function matchesAnySurface(pathname, registry) {
  return registry.surfaces.some(surface => surface.patterns.some(pattern => matchesPattern(pathname, pattern)))
}

export function matchesPattern(pathname, pattern) {
  let expression = ''
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern.slice(index, index + 3) === '**/') {
      expression += '(?:.*/)?'
      index += 2
    } else if (pattern.slice(index, index + 2) === '**') {
      expression += '.*'
      index += 1
    } else if (pattern[index] === '*') {
      expression += '[^/]*'
    } else {
      expression += pattern[index].replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${expression}$`).test(pathname.replace(/\\/g, '/'))
}

export function createValidationSession({ root, registry, toolchain = defaultToolchain(root) }) {
  return {
    root,
    registry,
    toolchain,
    prerequisites: new Map(),
    commandEvents: [],
    environment: {},
    cacheDirectory: mkdtempSync(path.join(os.tmpdir(), 'appraise-harness-validation-')),
  }
}

export function disposeValidationSession(session) {
  if (session.cacheDirectory) rmSync(session.cacheDirectory, { recursive: true, force: true })
  session.cacheDirectory = undefined
}

function defaultToolchain(root) {
  const typescriptVersion = JSON.parse(
    readFileSync(path.join(root, 'node_modules/typescript/package.json'), 'utf8'),
  ).version
  return `${process.version}:typescript-${typescriptVersion}:${hashFiles(root, ['package.json', 'package-lock.json'])}`
}

export function prerequisiteFingerprint(session, prerequisite) {
  return `${session.toolchain}:${hashFiles(session.root, prerequisite.inputPatterns ?? [])}`
}

function hashFiles(root, patterns) {
  const hash = createHash('sha256')
  for (const file of walkFiles(root)) {
    const relative = path.relative(root, file).replace(/\\/g, '/')
    if (patterns.some(pattern => matchesPattern(relative, pattern))) {
      hash.update(relative)
      const stat = lstatSync(file)
      if (stat.isSymbolicLink() && path.relative(root, realpathSync(file)).startsWith('..')) {
        throw new Error(`Refusing to cache an external symlink input: ${relative}`)
      }
      hash.update(readFileSync(file))
    }
  }
  return hash.digest('hex')
}

function walkFiles(root) {
  const excluded = new Set(['.git', '.next', 'node_modules', 'coverage'])
  const files = []
  const walk = directory => {
    if (!existsSync(directory)) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && excluded.has(entry.name)) continue
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(fullPath)
      else if (entry.isFile() || entry.isSymbolicLink()) files.push(fullPath)
    }
  }
  walk(root)
  return files.sort()
}

export function executeValidationPlan(plan, session, options = {}) {
  const execute = options.executeCommand ?? executeCommand
  const events = []
  for (const command of plan.commands) {
    for (const prerequisiteId of command.prerequisites ?? []) {
      const prerequisite = session.registry.prerequisites.find(item => item.id === prerequisiteId)
      const fingerprint = prerequisiteFingerprint(session, prerequisite)
      const cached = session.prerequisites.get(prerequisiteId)
      const cucumberCacheValid =
        prerequisiteId !== 'cucumber-runtime' || validCucumberCache(session, cached, fingerprint)
      if (cached?.fingerprint === fingerprint && cached.status === 0 && cucumberCacheValid) {
        if (prerequisiteId === 'cucumber-runtime') writeCucumberRuntimeReceipt(session, cached)
        events.push({ type: 'prerequisite', id: prerequisiteId, reused: true, durationMs: 0, retries: 0 })
        continue
      }
      const cucumberInputBefore =
        prerequisiteId === 'cucumber-runtime' ? cucumberRuntimeInputFingerprint(session.root) : null
      const event = execute(prerequisite, session.root, options.env)
      const cucumberInputAfter =
        prerequisiteId === 'cucumber-runtime' ? cucumberRuntimeInputFingerprint(session.root) : null
      const inputChanged = cucumberInputBefore !== cucumberInputAfter
      const status = event.status === 0 && inputChanged ? 1 : event.status
      const entry = {
        fingerprint,
        status,
        cucumberInputFingerprint: cucumberInputAfter,
        cucumberArtifactFingerprint:
          prerequisiteId === 'cucumber-runtime' && status === 0
            ? cucumberRuntimeArtifactFingerprint(session.root)
            : null,
      }
      session.prerequisites.set(prerequisiteId, entry)
      events.push({ type: 'prerequisite', id: prerequisiteId, reused: false, inputChanged, ...event, status })
      if (status !== 0) return { status, events }
      if (prerequisiteId === 'cucumber-runtime') writeCucumberRuntimeReceipt(session, entry)
    }
    const event = execute(command, session.root, { ...options.env, ...session.environment })
    events.push({ type: 'command', id: command.id, reused: false, ...event })
    if (event.status !== 0) return { status: event.status, events }
  }
  session.commandEvents.push(...events)
  return { status: 0, events }
}

function validCucumberCache(session, cached, fingerprint) {
  if (!cached || cached.fingerprint !== fingerprint || cached.status !== 0) return false
  try {
    return (
      cached.cucumberInputFingerprint === cucumberRuntimeInputFingerprint(session.root) &&
      cached.cucumberArtifactFingerprint === cucumberRuntimeArtifactFingerprint(session.root)
    )
  } catch {
    return false
  }
}

function writeCucumberRuntimeReceipt(session, cached) {
  if (!session.cacheDirectory) throw new Error('Validation session has already been disposed.')
  const receiptPath = path.join(session.cacheDirectory, 'cucumber-runtime.json')
  writeFileSync(
    receiptPath,
    JSON.stringify({
      version: 1,
      prerequisiteFingerprint: cached.fingerprint,
      inputFingerprint: cached.cucumberInputFingerprint,
      artifactFingerprint: cached.cucumberArtifactFingerprint,
      nodeVersion: process.version,
      issuedAt: new Date().toISOString(),
    }),
    { mode: 0o600 },
  )
  session.environment.APPRAISE_CUCUMBER_RUNTIME_RECEIPT = receiptPath
}

export function executeCommand(command, root, env = {}, runner = spawnSync) {
  let attempts = 0
  let result
  const started = performance.now()
  do {
    result = runner(command.command[0], command.command.slice(1), {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: 'inherit',
      timeout: command.timeoutMs,
    })
    attempts += 1
    if ((result.status ?? 1) === 0) break
  } while (attempts <= command.retryLimit)
  return {
    status: result.status ?? 1,
    durationMs: Number((performance.now() - started).toFixed(2)),
    retries: Math.max(0, attempts - 1),
    timedOut: result.signal === 'SIGTERM',
  }
}

const CI_COMPOSITE_ALIASES = {
  'npm run release:check:architecture': ['npm run quality:fallow:release', 'npm run quality:react-doctor:ci'],
  'npm run release:check:bounded-reads': ['npm run validate:unit', 'npm run benchmark:repository-queries'],
  'npm run release:check:mcp-contract': ['npm run release:check:mcp-http'],
}

const DOCUMENTED_CI_GATES = [
  'npx prisma generate',
  'node e2e/apply-migrations.mjs',
  'npm run release:check:operation-drift',
  'npm run release:check:operation-projections',
  'npm run release:check:operation-certification',
  'npm run release:check -- --ledger-only',
]

export function releaseLedgerCiRequirements(ledger) {
  return [
    ...new Set(
      ledger.findings
        .filter(finding => finding.status === 'verified')
        .flatMap(finding => finding.verificationCommands)
        .flatMap(command => CI_COMPOSITE_ALIASES[command] ?? [command]),
    ),
  ]
}

export function documentedCiRequirements(root) {
  const ledger = JSON.parse(readFileSync(path.join(root, 'config/release-readiness.json'), 'utf8'))
  return [...new Set([...releaseLedgerCiRequirements(ledger), ...DOCUMENTED_CI_GATES])]
}

export function verifyCiCoverage(registry, workflowContents, { root = process.cwd(), requirements } = {}) {
  const workflow = typeof workflowContents === 'string' ? YAML.parse(workflowContents) : workflowContents
  const registryMissing = registry.commands
    .filter(command => command.stages.includes('ci') && command.ciCommand)
    .filter(command => !hasRequiredCiStep(workflow, command))
    .map(command => `${command.ciJob}: ${command.ciCommand}`)
  const requiredCommands = requirements ?? documentedCiRequirements(root)
  const documentedMissing = requiredCommands.filter(command => !hasRequiredCiCommand(workflow, command))
  const missing = [...registryMissing, ...documentedMissing]
  if (missing.length) throw new Error(`CI is missing registry validation coverage: ${missing.join(', ')}`)
  return true
}

function hasRequiredCiStep(workflow, command) {
  const job = workflow.jobs?.[command.ciJob]
  const releaseCheck = workflow.jobs?.['release-check']
  if (!job || job.if || job['continue-on-error'] || !releaseCheck?.needs?.includes(command.ciJob)) return false
  return (job.steps ?? []).some(step => step.run === command.ciCommand && !step.if && !step['continue-on-error'])
}

function hasRequiredCiCommand(workflow, command) {
  const releaseCheck = workflow.jobs?.['release-check']
  return (releaseCheck?.needs ?? []).some(jobId => {
    const job = workflow.jobs?.[jobId]
    if (!job || job.if || job['continue-on-error']) return false
    return (job.steps ?? []).some(step => step.run === command && !step.if && !step['continue-on-error'])
  })
}

export function validationMatrixRows(registry) {
  return registry.commands.map(command => ({
    command: command.id,
    stages: command.stages.join(', '),
    prerequisites: (command.prerequisites ?? []).join(', ') || 'none',
    timeoutMs: command.timeoutMs,
    retryLimit: command.retryLimit,
    ci: command.ciCommand ? `${command.ciJob}: ${command.ciCommand}` : 'not applicable',
  }))
}

export function renderValidationMatrix(registry) {
  return [
    '| Validation | Stages | Prerequisites | Timeout | Retries | CI coverage |',
    '| --- | --- | --- | ---: | ---: | --- |',
    ...validationMatrixRows(registry).map(
      row =>
        `| ${row.command} | ${row.stages} | ${row.prerequisites} | ${row.timeoutMs} ms | ${row.retryLimit} | ${row.ci} |`,
    ),
  ].join('\n')
}
