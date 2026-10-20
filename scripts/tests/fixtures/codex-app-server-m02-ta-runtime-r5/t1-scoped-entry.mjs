/** T1-only wrapper for the accepted scoped entry. Import is inert. */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runScopedWorkerEntry } from './scoped-worker-entry.mjs'

const ROOT = '/private/tmp/appraise-m02-ta-descriptors-p2'
const BOOTSTRAP = join(ROOT, 'cases', 'T1', 'codex', 'mcp-bootstrap.json')
const SUPERVISOR = join(ROOT, 'cases', 'T1', 'supervisor')
const sha = value => `sha256:${createHash('sha256').update(value).digest('hex')}`
const ancestors = [ROOT, join(ROOT, 'cases'), join(ROOT, 'cases', 'T1'), SUPERVISOR]
const ownedDirectory = state =>
  state.isDirectory() && !state.isSymbolicLink() && state.uid === process.getuid() && (state.mode & 0o777) === 0o700

export function t1ReceiptContext(path, bootstrap) {
  if (path !== BOOTSTRAP || !bootstrap || Object.keys(bootstrap).sort().join() !== 'capability,caseId,schema,url')
    throw new Error('T1 bootstrap identity mismatch')
  if (
    bootstrap.schema !== 'appraise.m02-ta-bridge-bootstrap/v1' ||
    bootstrap.caseId !== 'T1' ||
    !/^[A-Za-z0-9_-]{32,200}$/.test(bootstrap.capability) ||
    !/^http:\/\/127\.0\.0\.1:[0-9]+\/m02\/canonical$/.test(bootstrap.url)
  )
    throw new Error('T1 bootstrap contract mismatch')
  return Object.freeze({
    caseId: 'T1',
    capabilityHash: sha(bootstrap.capability),
    bootstrapHash: sha(JSON.stringify(bootstrap)),
  })
}

export function writeT1ChildReceipt(path, receipt, io = fs, expectedSupervisor = null) {
  if (!['mcp-startup.json', 'mcp-exit.json'].some(name => path === join(SUPERVISOR, name)))
    throw new Error('T1 receipt path mismatch')
  if (dirname(path) !== SUPERVISOR || receipt?.caseId !== 'T1') throw new Error('T1 receipt mismatch')
  for (const directory of ancestors) {
    const state = io.lstatSync(directory)
    if (
      !ownedDirectory(state) ||
      (directory === SUPERVISOR &&
        expectedSupervisor &&
        (state.dev !== expectedSupervisor.dev || state.ino !== expectedSupervisor.ino))
    )
      throw new Error('T1 receipt ancestor identity changed')
  }
  const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`)
  if (bytes.length > 4096) throw new Error('T1 receipt bound')
  const fd = io.openSync(
    path,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o600,
  )
  try {
    io.writeFileSync(fd, bytes)
    io.fsyncSync(fd)
  } finally {
    io.closeSync(fd)
  }
  const directory = io.openSync(SUPERVISOR, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try {
    io.fsyncSync(directory)
  } finally {
    io.closeSync(directory)
  }
}

export async function runT1ScopedEntry({
  args = process.argv.slice(2),
  bootstrapPath = process.env.APPRAISE_M02_BOOTSTRAP_PATH,
  readBootstrap = path => JSON.parse(fs.readFileSync(path, 'utf8')),
  writeReceipt = writeT1ChildReceipt,
  runEntry = runScopedWorkerEntry,
  onExit = listener => process.on('exit', listener),
  onSignal = listener => process.on('SIGTERM', listener),
} = {}) {
  if (bootstrapPath !== BOOTSTRAP || args.length !== 1 || args[0] !== '--m02-ta-scoped-worker')
    throw new Error('T1 scoped entry invocation mismatch')
  const bootstrapState = fs.lstatSync(bootstrapPath)
  if (
    !bootstrapState.isFile() ||
    bootstrapState.isSymbolicLink() ||
    bootstrapState.uid !== process.getuid() ||
    (bootstrapState.mode & 0o777) !== 0o600
  )
    throw new Error('T1 bootstrap file identity mismatch')
  const bootstrap = readBootstrap(bootstrapPath)
  const context = t1ReceiptContext(bootstrapPath, bootstrap)
  const result = await runEntry({ args, bootstrapPath })
  if (
    result?.requiredFailure !== false ||
    !/^sha256:[a-f0-9]{64}$/.test(result.endpoint?.advertisedProfile?.profileDigest ?? '')
  )
    throw new Error('T1 scoped endpoint startup incomplete')
  const profileDigest = result.endpoint.advertisedProfile.profileDigest
  const supervisorState = fs.lstatSync(SUPERVISOR)
  if (!ownedDirectory(supervisorState)) throw new Error('T1 supervisor identity mismatch')
  writeReceipt(
    join(SUPERVISOR, 'mcp-startup.json'),
    {
      schema: 'appraise.m02-ta-t1-child-receipt/v1',
      event: 'sdk-connect-returned',
      evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
      ...context,
      profileDigest,
    },
    fs,
    supervisorState,
  )
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
    writeReceipt(
      join(SUPERVISOR, 'mcp-exit.json'),
      {
        schema: 'appraise.m02-ta-t1-child-receipt/v1',
        event: 'node-exit-handler',
        evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
        ...context,
        profileDigest,
        exitCode: code,
      },
      fs,
      supervisorState,
    )
  })
  return { context, profileDigest }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runT1ScopedEntry().catch(() => {
    process.stderr.write('T1 scoped entry failed.\n')
    process.exitCode = 1
  })
}
