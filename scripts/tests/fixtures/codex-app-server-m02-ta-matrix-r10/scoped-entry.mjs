/** Disposable T2 scoped-child receipt wrapper; import performs no I/O. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { POLICY, casePolicy } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { runScopedWorkerEntry } from './scoped-worker-entry.mjs'

const ROOT = POLICY.roots.T2
const sha = value => `sha256:${createHash('sha256').update(value).digest('hex')}`
const owned = state =>
  state.isDirectory() && !state.isSymbolicLink() && state.uid === process.getuid() && (state.mode & 0o777) === 0o700

export function writeMatrixChildReceipt({ caseId, name, receipt, expectedSupervisor, io = fs }) {
  if (
    casePolicy(caseId).phase !== 'T2' ||
    !['mcp-startup.json', 'mcp-exit.json'].includes(name) ||
    receipt?.caseId !== caseId
  )
    throw new Error('matrix child receipt contract')
  const parent = join(ROOT, 'cases', caseId, 'supervisor')
  for (const directory of [ROOT, join(ROOT, 'cases'), join(ROOT, 'cases', caseId), parent]) {
    const state = io.lstatSync(directory)
    if (
      !owned(state) ||
      (directory === parent &&
        expectedSupervisor &&
        (state.dev !== expectedSupervisor.dev || state.ino !== expectedSupervisor.ino))
    )
      throw new Error('matrix child receipt ancestor changed')
  }
  const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`)
  if (bytes.length > 4096) throw new Error('matrix child receipt bound')
  const file = join(parent, name)
  if (dirname(file) !== parent) throw new Error('matrix child receipt path')
  const fd = io.openSync(
    file,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o600,
  )
  try {
    io.writeFileSync(fd, bytes)
    io.fsyncSync(fd)
  } finally {
    io.closeSync(fd)
  }
  const dirfd = io.openSync(parent, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try {
    io.fsyncSync(dirfd)
  } finally {
    io.closeSync(dirfd)
  }
}

export async function runMatrixScopedEntry({
  args = process.argv.slice(2),
  bootstrapPath = process.env.APPRAISE_M02_BOOTSTRAP_PATH,
  runEntry = runScopedWorkerEntry,
  onExit = listener => process.on('exit', listener),
  onSignal = listener => process.on('SIGTERM', listener),
  writeReceipt = writeMatrixChildReceipt,
} = {}) {
  if (
    !Array.isArray(args) ||
    args[0] !== '--m02-ta-scoped-worker' ||
    (args.length !== 1 && !(args.length === 2 && args[1] === '--m02-ta-required-failure'))
  )
    throw new Error('matrix scoped child invocation')
  if (args.length === 2) {
    if (bootstrapPath !== join(ROOT, 'cases', 'P00', 'codex', 'mcp-bootstrap.json'))
      throw new Error('P00 scoped child path mismatch')
    const result = await runEntry({ args, bootstrapPath })
    if (result?.requiredFailure !== true) throw new Error('P00 scoped failure not selected')
    const supervisor = join(ROOT, 'cases', 'P00', 'supervisor')
    const supervisorState = fs.lstatSync(supervisor)
    if (!owned(supervisorState)) throw new Error('P00 supervisor identity')
    const receipt = {
      schema: 'appraise.m02-ta-matrix-child-receipt/v1',
      caseId: 'P00',
      evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
    }
    writeReceipt({
      caseId: 'P00',
      name: 'mcp-startup.json',
      expectedSupervisor: supervisorState,
      receipt: { ...receipt, event: 'required-failure-selected' },
    })
    onExit(code => {
      writeReceipt({
        caseId: 'P00',
        name: 'mcp-exit.json',
        expectedSupervisor: supervisorState,
        receipt: { ...receipt, event: 'node-exit-handler', exitCode: code },
      })
    })
    return result
  }
  if (typeof bootstrapPath !== 'string') throw new Error('scoped bootstrap missing')
  const caseId = bootstrapPath.split('/').at(-3)
  if (casePolicy(caseId).phase !== 'T2' || bootstrapPath !== join(ROOT, 'cases', caseId, 'codex', 'mcp-bootstrap.json'))
    throw new Error('matrix scoped child path mismatch')
  const bootstrapState = fs.lstatSync(bootstrapPath)
  if (
    !bootstrapState.isFile() ||
    bootstrapState.isSymbolicLink() ||
    bootstrapState.uid !== process.getuid() ||
    (bootstrapState.mode & 0o777) !== 0o600
  )
    throw new Error('matrix bootstrap identity')
  const bootstrap = JSON.parse(fs.readFileSync(bootstrapPath, 'utf8'))
  if (
    Object.keys(bootstrap).sort().join(',') !== 'capability,caseId,schema,url' ||
    bootstrap.caseId !== caseId ||
    bootstrap.schema !== 'appraise.m02-ta-bridge-bootstrap/v1' ||
    !/^[A-Za-z0-9_-]{32,200}$/.test(bootstrap.capability) ||
    !/^http:\/\/127\.0\.0\.1:[0-9]+\/m02\/canonical$/.test(bootstrap.url)
  )
    throw new Error('matrix bootstrap contract')
  const context = {
    caseId,
    capabilityHash: sha(bootstrap.capability),
    bootstrapHash: sha(JSON.stringify(bootstrap)),
  }
  const result = await runEntry({ args, bootstrapPath })
  if (
    result?.requiredFailure !== false ||
    !/^sha256:[a-f0-9]{64}$/.test(result.endpoint?.advertisedProfile?.profileDigest ?? '')
  )
    throw new Error('matrix SDK startup incomplete')
  const supervisor = join(ROOT, 'cases', caseId, 'supervisor')
  const supervisorState = fs.lstatSync(supervisor)
  if (!owned(supervisorState)) throw new Error('matrix supervisor identity')
  const profileDigest = result.endpoint.advertisedProfile.profileDigest
  writeReceipt({
    caseId,
    name: 'mcp-startup.json',
    expectedSupervisor: supervisorState,
    receipt: {
      schema: 'appraise.m02-ta-matrix-child-receipt/v1',
      event: 'sdk-connect-returned',
      evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
      ...context,
      profileDigest,
    },
  })
  let stopping = false
  onSignal(() => {
    if (stopping) return
    stopping = true
    Promise.resolve(result.endpoint.server.close()).then(
      () => {
        process.exitCode = 0
      },
      () => {
        process.exitCode = 1
      },
    )
  })
  onExit(code => {
    writeReceipt({
      caseId,
      name: 'mcp-exit.json',
      expectedSupervisor: supervisorState,
      receipt: {
        schema: 'appraise.m02-ta-matrix-child-receipt/v1',
        event: 'node-exit-handler',
        evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
        ...context,
        profileDigest,
        exitCode: code,
      },
    })
  })
  return { context, profileDigest }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runMatrixScopedEntry()
    .then(result => {
      if (result.requiredFailure) {
        process.stderr.write('Required scoped MCP unavailable.\n')
        process.exitCode = 1
      }
    })
    .catch(() => {
      process.stderr.write('Matrix scoped MCP initialization failed.\n')
      process.exitCode = 1
    })
}
