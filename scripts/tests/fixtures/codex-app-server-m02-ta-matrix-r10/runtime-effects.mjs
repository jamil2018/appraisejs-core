/** Inert native ports. No factory is called, process started, or socket opened on import. */
import * as fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { isAbsolute, join, relative } from 'node:path'
import { digest, POLICY } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { classifyProviderHeaders } from '../codex-app-server-m02-ta-runtime-r9/provider-diagnostic.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
export async function emitReviewedResponse(outgoing, result) {
  await new Promise((resolve, reject) => {
    let finished = false
    outgoing.once('finish', () => {
      finished = true
      resolve()
    })
    outgoing.once('close', () => {
      if (!finished) reject(new Error('response closed before finish'))
    })
    outgoing.once('error', reject)
    outgoing.writeHead(result.status, result.headers)
    outgoing.end(result.body)
  })
  if (typeof result.afterWrite === 'function') await result.afterWrite()
}
const realIo = {
  fs,
  spawn,
  createServer,
  fileDigest: async path => sha(await fs.readFile(path)),
  tuple: async () => {
    if (process.platform !== 'darwin') throw new Error('unsupported host tuple')
    const plist = await fs.readFile('/System/Library/CoreServices/SystemVersion.plist', 'utf8')
    const osBuild = plist.match(/<key>ProductBuildVersion<\/key>\s*<string>([^<]+)<\/string>/)?.[1]
    return {
      platform: process.platform,
      arch: process.arch,
      osBuild,
      nodeExecutable: process.execPath,
      nodeMajor: Number(process.versions.node.split('.')[0]),
    }
  },
}

/**
 * authorize must consult the separately approved exact host command/manifest. Its return is a
 * trusted-caller seam, not authenticated permission proof. Each effect must also hold a durable
 * reservation supplied by the campaign coordinator. JSON/config/environment cannot enable this.
 */
export function createNativePorts({
  prepared,
  precreatedRootIdentity,
  authorize,
  withReservation,
  recordRecovery,
  onUncertain,
  consumeReservation,
  io = realIo,
}) {
  if (
    !Number.isSafeInteger(precreatedRootIdentity?.dev) ||
    !Number.isSafeInteger(precreatedRootIdentity?.ino) ||
    typeof authorize !== 'function' ||
    typeof withReservation !== 'function' ||
    typeof recordRecovery !== 'function' ||
    typeof onUncertain !== 'function' ||
    typeof consumeReservation !== 'function'
  )
    throw new Error('external authority verifier and durable effect coordinator required')
  const manifest = structuredClone(prepared.manifest)
  const manifestDigest = digest(manifest)
  if (manifestDigest !== prepared.manifestDigest || prepared.blockers.length)
    throw new Error('incomplete or changed reviewed manifest')
  const children = new Set()
  const allChildren = new Set()
  const stoppedChildren = new Set()
  const listeners = new Set()
  const roots = new Map()
  const endpoints = new Set()
  let busy = false
  let tail = Promise.resolve()
  let queued = 0
  let fenced = false
  async function guard(action, id, kind, operation, reservation = null) {
    if (fenced || queued >= 4) {
      await Promise.resolve()
        .then(onUncertain)
        .catch(() => {})
      throw new Error('native ports fenced or queue exceeded')
    }
    queued++
    const previous = tail
    let release
    tail = new Promise(resolve => {
      release = resolve
    })
    await previous
    busy = true
    try {
      if (fenced) throw new Error('native ports fenced')
      if ((await authorize({ action, id, manifestDigest, manifest: structuredClone(manifest) })) !== true)
        throw new Error('NOT_AUTHORIZED_TO_RUN')
      // A new approval-verification callback is required at every effect, never a cached grant.
      if (reservation) {
        if (!consumeReservation(reservation, kind, id)) throw new Error('missing or consumed durable reservation')
        return await operation()
      }
      return await withReservation(
        kind,
        id,
        operation,
        action === 'codex-child' ? { related: [{ kind: 'mcpStarts', id: `${id}-mcp` }] } : {},
      )
    } catch (error) {
      fenced = true
      await Promise.resolve()
        .then(onUncertain)
        .catch(() => {})
      throw error
    } finally {
      busy = false
      queued--
      release()
    }
  }
  async function verifyFiles() {
    const tuple = await io.tuple()
    const interpreter = manifest.artifacts.find(item => item.purpose === 'interpreter')
    if (
      tuple.platform !== POLICY.executable.platform ||
      tuple.arch !== POLICY.executable.arch ||
      tuple.osBuild !== POLICY.executable.osBuild ||
      tuple.nodeExecutable !== interpreter?.path ||
      tuple.nodeMajor !== POLICY.executable.nodeMajor
    )
      throw new Error('host/interpreter tuple drift')
    for (const item of manifest.artifacts) {
      const stat = await io.fs.lstat(item.path)
      if (!stat.isFile() || stat.isSymbolicLink() || (await io.fileDigest(item.path)) !== item.sha256)
        throw new Error('artifact identity drift')
    }
  }
  async function checkRoot(root) {
    const expected = roots.get(root)
    const stat = await io.fs.lstat(root)
    if (
      !expected ||
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.dev !== expected.dev ||
      stat.ino !== expected.ino ||
      (stat.mode & 0o777) !== 0o700 ||
      stat.uid !== process.getuid()
    )
      throw new Error('owned path identity lost')
  }
  return Object.freeze({
    // Caller supplies the exact case paths in the reviewed manifest. No recursive mkdir fallback.
    startProvider({
      id,
      caseId = manifest.cases[0],
      request,
      onCaptured,
      canonicalRequest,
      auditRequest,
      auditCapability,
      onProviderFailure,
    }) {
      return guard('owned-loopback-listener', id, 'listenerStarts', async () => {
        await verifyFiles()
        if (!roots.has(manifest.root)) {
          const state = await io.fs.lstat(manifest.root)
          if (
            !precreatedRootIdentity ||
            state.dev !== precreatedRootIdentity.dev ||
            state.ino !== precreatedRootIdentity.ino
          )
            throw new Error('precreated phase root identity mismatch')
          roots.set(manifest.root, state)
        }
        await checkRoot(manifest.root)
        if (!manifest.cases.includes(caseId)) throw new Error('case not in reviewed phase')
        const casesRoot = join(manifest.root, 'cases')
        if (!roots.has(casesRoot)) {
          await io.fs.mkdir(casesRoot, { mode: 0o700 })
          roots.set(casesRoot, await io.fs.lstat(casesRoot))
        }
        await checkRoot(casesRoot)
        for (const directory of [
          join(casesRoot, caseId),
          ...['home', 'codex', 'workspace', 'tmp', 'supervisor'].map(name => join(casesRoot, caseId, name)),
        ]) {
          await io.fs.mkdir(directory, { mode: 0o700 })
          roots.set(directory, await io.fs.lstat(directory))
          await checkRoot(directory)
        }
        let requests = 0
        let canonicalRequests = 0
        let auditRequests = 0
        const server = io.createServer(async (incoming, outgoing) => {
          const isT1Provider = manifest.phase === 'T1' && incoming.url === '/v1/responses'
          const headerClasses = classifyProviderHeaders(incoming.headers)
          let providerFailureReported = false
          const report = async category => {
            if (!isT1Provider || providerFailureReported) return
            providerFailureReported = true
            if (typeof onProviderFailure !== 'function') throw new Error('provider diagnostic port missing')
            await onProviderFailure({ category, headerClasses })
          }
          try {
            if (
              incoming.method !== 'POST' ||
              !['/v1/responses', '/m02/canonical', '/m02/audit'].includes(incoming.url) ||
              Object.hasOwn(incoming.headers, 'authorization') ||
              Object.hasOwn(incoming.headers, 'cookie')
            ) {
              await report('ROUTE_OR_AUTH_HEADER')
              throw new Error('unplanned provider request')
            }
            if (!headerClasses.accepted) {
              await report(
                !['JSON', 'JSON_UTF8'].includes(headerClasses.contentTypeClass)
                  ? 'CONTENT_TYPE_UNSUPPORTED'
                  : 'CONTENT_ENCODING_UNSUPPORTED',
              )
              throw new Error('provider content headers unsupported')
            }
            const canonical = incoming.url === '/m02/canonical'
            const audit = incoming.url === '/m02/audit'
            if (canonical) canonicalRequests++
            else if (audit) auditRequests++
            else requests++
            const result = await guard(
              canonical ? 'canonical-ipc-request' : audit ? 'scoped-audit-request' : 'scripted-provider-request',
              canonical
                ? `${id}-canonical-${canonicalRequests}`
                : audit
                  ? `${id}-audit-${auditRequests}`
                  : `${id}-request-${requests}`,
              canonical ? 'canonicalRequests' : audit ? 'auditRequests' : 'providerRequests',
              async () => {
                const chunks = []
                let size = 0
                try {
                  for await (const chunk of incoming) {
                    size += chunk.length
                    if (size > (audit ? 64 * 1024 : 1024 * 1024)) {
                      await report('BODY_LIMIT_EXCEEDED')
                      throw new Error('request bound exceeded')
                    }
                    chunks.push(chunk)
                  }
                } catch {
                  await report('BODY_READ_ERROR')
                  throw new Error('request body read failed')
                }
                const bytes = Buffer.concat(chunks)
                let source, body
                try {
                  source = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
                } catch {
                  await report('UTF8_INVALID')
                  throw new Error('request UTF8 invalid')
                }
                try {
                  body = JSON.parse(source)
                } catch {
                  await report('JSON_INVALID')
                  throw new Error('request JSON invalid')
                }
                if (canonical) {
                  if (typeof canonicalRequest !== 'function') throw new Error('canonical bridge missing')
                  const result = await canonicalRequest(body)
                  if (result?.ok !== true) throw new Error('canonical bridge blocked')
                  const json = JSON.stringify(result)
                  if (Buffer.byteLength(json) > 1024 * 1024) throw new Error('canonical response bound')
                  return { status: 200, headers: { 'Content-Type': 'application/json' }, body: json }
                }
                if (audit) {
                  if (
                    typeof auditRequest !== 'function' ||
                    typeof auditCapability !== 'string' ||
                    !body ||
                    typeof body !== 'object' ||
                    Array.isArray(body) ||
                    Object.keys(body).sort().join(',') !== 'capability,caseId,event,schema' ||
                    body.schema !== 'appraise.m02-ta-scoped-audit/v1' ||
                    body.caseId !== caseId ||
                    body.capability !== auditCapability
                  )
                    throw new Error('audit capability or body mismatch')
                  const receipt = await auditRequest(body.event)
                  if (receipt?.status !== 'ACKNOWLEDGED') throw new Error('audit event not acknowledged')
                  return {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: '{"status":"ACKNOWLEDGED"}',
                  }
                }
                if (manifest.phase === 'T1') {
                  if (requests !== 1 || typeof onCaptured !== 'function') throw new Error('capture contract')
                  let capture
                  try {
                    capture = await onCaptured(
                      {
                        method: 'POST',
                        path: '/v1/responses',
                        headers: { 'content-type': 'application/json' },
                        body: bytes,
                      },
                      headerClasses,
                    )
                  } catch {
                    await report('CAPTURE_CONTRACT_INVALID')
                    throw new Error('capture callback failed')
                  }
                  if (capture?.status !== 'CAPTURED' || !/^sha256:[a-f0-9]{64}$/.test(capture.descriptorHash ?? '')) {
                    await report('CAPTURE_CONTRACT_INVALID')
                    throw new Error('incomplete actual descriptor capture')
                  }
                  return {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' },
                    body: '{"error":"capture complete"}',
                  }
                }
                if (typeof request !== 'function') throw new Error('reviewed scripted response missing')
                // The matrix gate inspects the exact received bytes. It must never
                // reconstruct a provider request from JSON.parse output.
                const response = await request({ body, bodyBytes: bytes, headerClasses, requestIndex: requests })
                if (
                  !response ||
                  ![200, 400, 503].includes(response.status) ||
                  typeof response.body !== 'string' ||
                  Buffer.byteLength(response.body) > 1024 * 1024 ||
                  Object.keys(response.headers ?? {}).some(key => !['Content-Type'].includes(key))
                )
                  throw new Error('unreviewed provider response')
                return response
              },
            )
            await emitReviewedResponse(outgoing, result)
          } catch {
            await report('CAPTURE_CONTRACT_INVALID').catch(() => {})
            fenced = true
            await Promise.resolve()
              .then(onUncertain)
              .catch(() => {})
            if (!outgoing.headersSent && !outgoing.writableEnded) {
              outgoing.writeHead(503, { 'Content-Type': 'application/json' })
              outgoing.end('{"error":"campaign fenced"}')
            } else outgoing.destroy?.()
          }
        })
        listeners.add(server)
        await new Promise((resolve, reject) => {
          server.once('error', reject)
          server.listen(0, '127.0.0.1', resolve)
        })
        const address = server.address()
        if (!address || typeof address === 'string' || address.address !== '127.0.0.1')
          throw new Error('owned loopback endpoint missing')
        endpoints.add(`http://127.0.0.1:${address.port}/m02/canonical`)
        return { server, port: address.port }
      })
    },
    writeBootstrap({ id, caseId, value }) {
      return guard('private-synthetic-bootstrap', id, 'controlWrites', async () => {
        if (
          !manifest.cases.includes(caseId) ||
          value?.schema !== 'appraise.m02-ta-bridge-bootstrap/v1' ||
          value.caseId !== caseId ||
          !/^[A-Za-z0-9_-]{32,200}$/.test(value.capability ?? '') ||
          !endpoints.has(value.url) ||
          Object.keys(value).sort().join() !== 'capability,caseId,schema,url'
        )
          throw new Error('bootstrap binding')
        const parent = join(manifest.root, 'cases', caseId, 'codex')
        for (const path of [manifest.root, join(manifest.root, 'cases'), join(manifest.root, 'cases', caseId), parent])
          await checkRoot(path)
        const path = join(parent, 'mcp-bootstrap.json')
        const handle = await io.fs.open(
          path,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
          0o600,
        )
        try {
          await handle.writeFile(JSON.stringify(value))
          await handle.sync()
        } finally {
          await handle.close()
        }
        return path
      })
    },
    spawnCodex({ id, caseId = manifest.cases[0], cwd, env, args = ['app-server'] }) {
      return guard('codex-child', id, 'codexStarts', async () => {
        await verifyFiles()
        if (
          !manifest.artifacts.some(
            item => item.path === POLICY.executable.path && item.sha256 === POLICY.executable.sha256,
          ) ||
          !manifest.cases.includes(caseId) ||
          !isAbsolute(cwd ?? '') ||
          cwd !== join(manifest.root, 'cases', caseId, 'workspace') ||
          args.join('\0') !== 'app-server' ||
          Object.keys(env ?? {})
            .sort()
            .join() !== 'CODEX_HOME,HOME,TMPDIR' ||
          Object.entries({ HOME: 'home', CODEX_HOME: 'codex', TMPDIR: 'tmp' }).some(
            ([key, value]) => env[key] !== join(manifest.root, 'cases', caseId, value),
          )
        )
          throw new Error('child manifest incomplete')
        await checkRoot(manifest.root)
        for (const directory of new Set([cwd, ...Object.values(env)])) {
          let current = manifest.root
          for (const component of relative(manifest.root, directory).split('/')) {
            if (!component || component === '..') throw new Error('unsafe case path')
            current = join(current, component)
            await checkRoot(current)
          }
        }
        const child = io.spawn(POLICY.executable.path, args, {
          cwd,
          env: { ...env },
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
        })
        children.add(child)
        allChildren.add(child)
        child.once('close', () => {
          children.delete(child)
        })
        await new Promise((resolve, reject) => {
          child.once('error', reject)
          child.once('spawn', resolve)
        })
        return child
      })
    },
    sendOwned({ child, frame, id, kind, reservation }) {
      return guard(
        'owned-stdio-send',
        id,
        kind,
        async () => {
          if (
            !children.has(child) ||
            !['threadStarts', 'turnStarts', 'controlWrites', 'permissionReplies'].includes(kind)
          )
            throw new Error('owned start required')
          const method = kind === 'threadStarts' ? 'thread/start' : kind === 'turnStarts' ? 'turn/start' : null
          if (method && (frame?.id !== id || frame.method !== method)) throw new Error('start correlation')
          if (kind === 'controlWrites' && !['initialize', 'initialized', 'turn/interrupt'].includes(frame?.method))
            throw new Error('unreviewed control method')
          if (
            kind === 'permissionReplies' &&
            (`permission-${frame?.id}` !== id ||
              Object.keys(frame.result?.permissions ?? { invalid: true }).length ||
              frame.result?.scope !== 'turn')
          )
            throw new Error('permission grants forbidden')
          const bytes = Buffer.from(`${JSON.stringify(frame)}\n`)
          if (bytes.length > 1024 * 1024) throw new Error('frame bound')
          await new Promise((resolve, reject) => child.stdin.write(bytes, error => (error ? reject(error) : resolve())))
          // Transport write is not native acknowledgement. The supplied coordinator must retain this
          // intent pending until a separately correlated RPC reply is observed.
          return { sent: true, acknowledged: false, id }
        },
        reservation,
      )
    },
    async stopOwned({ child = [...children].at(-1), server = [...listeners].at(-1) } = {}) {
      // Stopping has separate authority and ownership; never signal a persisted PID.
      if ((await authorize({ action: 'owned-stop', manifestDigest, manifest: structuredClone(manifest) })) !== true)
        throw new Error('NOT_AUTHORIZED_TO_STOP')
      await recordRecovery('owned-stop-intent')
      const signalRequired = Boolean(child && children.has(child))
      if (child) {
        if (!allChildren.has(child) || stoppedChildren.has(child)) throw new Error('unowned or already stopped process')
        stoppedChildren.add(child)
        if (signalRequired) child.kill('SIGTERM')
      }
      if (server) {
        if (!listeners.has(server)) throw new Error('unowned listener')
        await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
        listeners.delete(server)
      }
      await recordRecovery('owned-stop-observed')
      return { stopRequested: signalRequired, processExitProved: false, listenerClosed: Boolean(server) }
    },
    snapshot: () => ({
      fenced,
      ownedChildren: children.size,
      ownedListeners: listeners.size,
      busy,
      runtimeAttested: false,
    }),
  })
}
