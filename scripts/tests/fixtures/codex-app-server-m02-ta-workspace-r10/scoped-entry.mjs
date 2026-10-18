/** T3 required MCP child with zero authorized tools/call dispatch. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { POLICY, casePolicy } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { runScopedWorkerEntry } from './scoped-worker-entry.mjs'

const ROOT = POLICY.roots.T3
const sha = value => `sha256:${createHash('sha256').update(value).digest('hex')}`
const owned = state =>
  state.isDirectory() && !state.isSymbolicLink() && state.uid === process.getuid() && (state.mode & 0o777) === 0o700

export function writeWorkspaceChildReceipt({ caseId, name, receipt, expectedSupervisor, io = fs }) {
  if (
    casePolicy(caseId).phase !== 'T3' ||
    !['mcp-startup.json', 'mcp-exit.json'].includes(name) ||
    receipt?.caseId !== caseId
  )
    throw new Error('T3 child receipt contract')
  const parent = join(ROOT, 'cases', caseId, 'supervisor')
  for (const directory of [ROOT, join(ROOT, 'cases'), join(ROOT, 'cases', caseId), parent]) {
    const state = io.lstatSync(directory)
    if (
      !owned(state) ||
      (directory === parent &&
        expectedSupervisor &&
        (state.dev !== expectedSupervisor.dev || state.ino !== expectedSupervisor.ino))
    )
      throw new Error('T3 child receipt ancestor changed')
  }
  const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`)
  if (bytes.length > 4096 || dirname(join(parent, name)) !== parent) throw new Error('T3 child receipt bound')
  const file = join(parent, name)
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
  const directory = io.openSync(parent, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try {
    io.fsyncSync(directory)
  } finally {
    io.closeSync(directory)
  }
}

export async function runWorkspaceScopedEntry({
  args = process.argv.slice(2),
  bootstrapPath = process.env.APPRAISE_M02_BOOTSTRAP_PATH,
  runEntry = runScopedWorkerEntry,
  onExit = listener => process.on('exit', listener),
  onSignal = listener => process.on('SIGTERM', listener),
  writeReceipt = writeWorkspaceChildReceipt,
} = {}) {
  if (
    !Array.isArray(args) ||
    args.length !== 1 ||
    args[0] !== '--m02-ta-scoped-worker' ||
    typeof bootstrapPath !== 'string'
  )
    throw new Error('T3 scoped child invocation')
  const caseId = bootstrapPath.split('/').at(-3)
  if (!['N01', 'N02'].includes(caseId) || bootstrapPath !== join(ROOT, 'cases', caseId, 'codex', 'mcp-bootstrap.json'))
    throw new Error('T3 scoped child path mismatch')
  const bootstrapState = fs.lstatSync(bootstrapPath)
  if (
    !bootstrapState.isFile() ||
    bootstrapState.isSymbolicLink() ||
    bootstrapState.uid !== process.getuid() ||
    (bootstrapState.mode & 0o777) !== 0o600 ||
    bootstrapState.nlink !== 1 ||
    bootstrapState.size > 65536
  )
    throw new Error('T3 bootstrap identity')
  const bootstrap = JSON.parse(fs.readFileSync(bootstrapPath, 'utf8'))
  if (
    Object.keys(bootstrap).sort().join(',') !== 'capability,caseId,schema,url' ||
    bootstrap.caseId !== caseId ||
    bootstrap.schema !== 'appraise.m02-ta-bridge-bootstrap/v1' ||
    !/^[A-Za-z0-9_-]{32,200}$/.test(bootstrap.capability) ||
    !/^http:\/\/127\.0\.0\.1:[0-9]+\/m02\/canonical$/.test(bootstrap.url)
  )
    throw new Error('T3 bootstrap contract')
  const context = { caseId, capabilityHash: sha(bootstrap.capability), bootstrapHash: sha(JSON.stringify(bootstrap)) }
  const result = await runEntry({ args, bootstrapPath })
  if (
    result?.requiredFailure !== false ||
    !/^sha256:[a-f0-9]{64}$/.test(result.endpoint?.advertisedProfile?.profileDigest ?? '')
  )
    throw new Error('T3 SDK startup incomplete')
  const supervisor = join(ROOT, 'cases', caseId, 'supervisor')
  const supervisorState = fs.lstatSync(supervisor)
  if (!owned(supervisorState)) throw new Error('T3 supervisor identity')
  const profileDigest = result.endpoint.advertisedProfile.profileDigest
  const base = {
    schema: 'appraise.m02-ta-workspace-child-receipt/v1',
    evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
    ...context,
    profileDigest,
  }
  writeReceipt({
    caseId,
    name: 'mcp-startup.json',
    expectedSupervisor: supervisorState,
    receipt: { ...base, event: 'sdk-connect-returned' },
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
  onExit(code =>
    writeReceipt({
      caseId,
      name: 'mcp-exit.json',
      expectedSupervisor: supervisorState,
      receipt: { ...base, event: 'node-exit-handler', exitCode: code },
    }),
  )
  return { context, profileDigest }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runWorkspaceScopedEntry().catch(() => {
    process.stderr.write('Workspace scoped MCP initialization failed.\n')
    process.exitCode = 1
  })
}
