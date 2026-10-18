/** Additive R24 investigation external peer/DB/OS simulation. Never opens a socket, process or native addon. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import vm from 'node:vm'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { readStableFile } from '../codex-app-server-m02-ta-matrix-r24/r21-evidence.mjs'
import { syntheticB14Request, B14_EMPTY_DENIAL } from '../codex-app-server-m02-ta-matrix-r23-offline/b14-request.mjs'

const sha = value => createHash('sha256').update(value).digest('hex')
const tick = () => new Promise(resolve => setImmediate(resolve))
export function redirectFs(module, root, target, operations = []) {
  const redirect = file =>
    typeof file === 'string' && (file === root || file.startsWith(`${root}/`)) ? target + file.slice(root.length) : file
  return new Proxy(module, {
    get(object, key) {
      if (typeof object[key] !== 'function') return object[key]
      return (...args) => {
        if (typeof args[0] === 'string') {
          operations.push({ operation: String(key), currentRoot: args[0] === root || args[0].startsWith(`${root}/`) })
          args[0] = redirect(args[0])
        }
        return object[key](...args)
      }
    },
  })
}

export function createOfflineEffects({
  prepared,
  target,
  policy,
  canonicalFile = null,
  failAtSpawn = false,
  resultForCall = null,
  transformOutput = value => value,
  omitAudit = false,
  failCleanup = false,
  loseResponseFinish = false,
}) {
  const root = prepared.manifest.root
  const operations = []
  const syncFs = redirectFs(fs, root, target, operations)
  const baseFs = new Proxy(fsp, {
    get(object, key) {
      if (typeof object[key] !== 'function') return object[key]
      return (...args) => {
        if (
          canonicalFile &&
          args[0] === prepared.manifest.artifacts.find(x => x.purpose === 'matrix-canonical-backend').path
        )
          args[0] = canonicalFile
        return object[key](...args)
      }
    },
  })
  const asyncFs = redirectFs(baseFs, root, target, operations)
  const counts = { fakeListeners: 0, fakeSpawns: 0, fakeStops: 0, providerRequests: 0, audits: 0 }
  const failures = []
  const bridges = new Map()
  let handler, caseId, child
  const tasks = []
  const schedule = fn => {
    const task = tick()
      .then(fn)
      .catch(error => {
        failures.push(error)
        child?.emit('error', new Error('offline external peer failed'))
      })
    tasks.push(task)
  }
  const http = async (url, body) => {
    const incoming = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
      method: 'POST',
      url,
      headers: { 'content-type': 'application/json' },
    })
    const outgoing = Object.assign(new EventEmitter(), {
      headersSent: false,
      writableEnded: false,
      writeHead(status) {
        this.status = status
        this.headersSent = true
      },
      end(body) {
        this.body = body
        this.writableEnded = true
        this.emit(loseResponseFinish && url === '/v1/responses' ? 'close' : 'finish')
      },
      destroy() {
        this.destroyed = true
      },
    })
    await handler(incoming, outgoing)
    assert.equal(outgoing.status, 200, `offline HTTP ${url}: ${outgoing.body}`)
    return outgoing.body
  }
  const emit = frame => child.stdout.emit('data', Buffer.from(`${JSON.stringify(frame)}\n`))
  const bootstrap = id =>
    JSON.parse(syncFs.readFileSync(path.join(root, 'cases', id, 'codex', 'mcp-bootstrap.json'), 'utf8'))
  const childReceipt = async (id, name) => {
    const event = name === 'mcp-startup.json' ? 'sdk-connect-returned' : 'node-exit-handler'
    if (id === 'P00')
      return {
        schema: 'appraise.m02-ta-matrix-child-receipt/v1',
        evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
        caseId: id,
        event: name === 'mcp-startup.json' ? 'required-failure-selected' : 'node-exit-handler',
        ...(name === 'mcp-exit.json' ? { exitCode: 1 } : {}),
      }
    const value = bootstrap(id)
    return {
      schema: 'appraise.m02-ta-matrix-child-receipt/v1',
      evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
      caseId: id,
      event,
      capabilityHash: `sha256:${sha(value.capability)}`,
      bootstrapHash: `sha256:${sha(JSON.stringify(value))}`,
      profileDigest: bridges.get(id).bridge.advertisedProfile.profileDigest,
      ...(name === 'mcp-exit.json' ? { exitCode: 0 } : {}),
    }
  }
  const permissionReplies = []
  const providerLoop = async () => {
    const id = caseId
    const seal = prepared.seal
    const base =
      id === 'B14'
        ? syntheticB14Request(seal).body
        : {
            model: policy.model,
            reasoning: { effort: policy.reasoning },
            input: [
              {
                ...structuredClone(seal.capture.containers[0].metadata),
                tools: structuredClone(seal.capture.containers[0].tools),
              },
            ],
          }
    for (let index = 0; index < 5; index++) {
      const body = await http('/v1/responses', base)
      counts.providerRequests++
      const events = body
        .split('\n')
        .filter(line => line.startsWith('data: '))
        .map(line => JSON.parse(line.slice(6)))
      const item = events.find(event => event.type === 'response.output_item.done')?.item
      assert.ok(item)
      if (item.type === 'message') {
        emit({
          method: 'turn/completed',
          params: { threadId: `${id}-thread`, turn: { id: `${id}-turn`, status: 'completed' } },
        })
        return
      }
      assert.equal(item.type, 'custom_tool_call')
      const emitted = []
      const tools = Object.create(null)
      const all = []
      const policyCase = policy.cases.find(entry => entry.id === id)
      const registryAbsent = /^B07-A(?:09|1[0-4])$/.test(id)
      if (id === 'B14') {
        all.push({ name: 'request_permissions' })
        tools.request_permissions = async () => {
          emit({
            id: 'permission-offline',
            method: 'item/permissions/requestApproval',
            params: {
              cwd: path.join(root, 'cases/B14/workspace'),
              itemId: 'offline-item',
              startedAtMs: 1,
              threadId: 'B14-thread',
              turnId: 'B14-turn',
              permissions: { network: { enabled: true } },
            },
          })
          for (let turns = 0; permissionReplies.length === 0 && turns < 100; turns++) await tick()
          assert.equal(permissionReplies.length, 1)
          assert.deepEqual(permissionReplies[0].result, { permissions: {}, scope: 'turn' })
          emit({
            method: 'serverRequest/resolved',
            params: { requestId: 'permission-offline', threadId: 'B14-thread' },
          })
          await tick()
          await tick()
          return B14_EMPTY_DENIAL
        }
      } else if (!registryAbsent) {
        for (const profile of seal.profiles.roles)
          for (const tool of profile.toolsList.tools) {
            const normalized = `mcp__appraise_m02__${tool.name}`
            if (tools[normalized]) continue
            all.push({ name: normalized })
            tools[normalized] = async args => {
              const rpcId = `${id}-rpc-${index}`
              const audit = event =>
                http('/m02/audit', {
                  schema: 'appraise.m02-ta-scoped-audit/v1',
                  caseId: id,
                  capability: 'a'.repeat(43),
                  event,
                })
              if (!omitAudit) await audit({ kind: 'request', id: rpcId, name: tool.name, arguments: args })
              const result = resultForCall
                ? await resultForCall({ caseId: id, index, name: tool.name, args })
                : { content: [], structuredContent: { offline: true }, isError: false }
              if (!omitAudit) await audit({ kind: 'result', id: rpcId, result })
              counts.audits += 2
              if (policyCase.expected === 'accepted' && index === policyCase.script.operations.length - 1)
                bridges.get(id).fixture.counts.effects = 1
              return result
            }
          }
      }
      await vm.runInNewContext(
        `(async()=>{${item.input}\n})()`,
        { ALL_TOOLS: all, tools, text: value => emitted.push(value) },
        { timeout: 1000 },
      )
      assert.equal(emitted.length, 1)
      const outputItem = {
        type: 'custom_tool_call_output',
        call_id: item.call_id,
        output: [
          { type: 'input_text', text: 'Script completed\nWall time 0.1 seconds\nOutput:\n' },
          { type: 'input_text', text: emitted[0] },
        ],
      }
      base.input.push(item, transformOutput(outputItem, { caseId: id, index, item }))
    }
    throw new Error('offline provider loop exceeded fixed bound')
  }
  const io = {
    fs: asyncFs,
    tuple: async () => ({
      ...policy.executable,
      nodeExecutable: prepared.manifest.artifacts.find(item => item.purpose === 'interpreter').path,
    }),
    fileDigest: async file =>
      sha(
        await readStableFile(
          canonicalFile && file === prepared.manifest.artifacts.find(x => x.purpose === 'matrix-canonical-backend').path
            ? canonicalFile
            : file,
        ),
      ),
    createServer: callback => {
      counts.fakeListeners++
      handler = callback
      const server = Object.assign(new EventEmitter(), {
        listen(_port, _host, callback) {
          callback()
        },
        address: () => ({ address: '127.0.0.1', port: 43120 }),
        close(callback) {
          callback()
        },
      })
      return server
    },
    spawn: (_executable, _args, options) => {
      counts.fakeSpawns++
      if (failAtSpawn) throw new Error('OFFLINE_STOP_AT_FAKE_PROCESS_BOUNDARY')
      caseId = path.basename(path.dirname(options.cwd))
      child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: () => {
          counts.fakeStops++
          child.emit('exit', null, 'SIGTERM')
          child.emit('close', null, 'SIGTERM')
          return true
        },
      })
      child.stdin = Object.assign(new EventEmitter(), {
        write: (bytes, callback) => {
          const frame = JSON.parse(bytes)
          callback()
          if (frame.method === 'initialize')
            schedule(() => emit({ id: frame.id, result: { userAgent: 'offline-fixture' } }))
          if (frame.method === 'thread/start')
            schedule(() =>
              caseId === 'P00'
                ? emit({
                    id: frame.id,
                    error: {
                      code: -32603,
                      message: 'error creating thread: required MCP servers failed to initialize: appraise_m02',
                    },
                  })
                : emit({ id: frame.id, result: { thread: { id: `${caseId}-thread` } } }),
            )
          if (frame.method === 'turn/start')
            schedule(async () => {
              emit({ id: frame.id, result: { turn: { id: `${caseId}-turn` } } })
              await tick()
              await tick()
              await providerLoop()
            })
          if (frame.id === 'permission-offline' && frame.result) permissionReplies.push(frame)
        },
      })
      queueMicrotask(() => child.emit('spawn'))
      return child
    },
  }
  const canonical = {
    canonicalPacket: () => ({ result: {} }),
    createMatrixCanonicalBridge({ role, caseId: id }) {
      const item = policy.cases.find(entry => entry.id === id)
      const profile = prepared.seal.profiles.roles.find(entry => entry.role === role)
      const fixture = {
        counts: { effects: 0 },
        gateway: {
          binding: { fixture: true },
          frozenReads: item.script.operations.map(step => ({ toolName: step.toolName, arguments: {} })),
        },
        seedForeignTriageReceipt: async () => ({ foreignReceiptId: 'offline-foreign' }),
        client: {
          qualityJourneyExternalSubmissionAcceptance: { count: async () => fixture.counts.effects },
          qualityJourneyArtifact: { count: async () => fixture.counts.effects },
        },
        readPersistedAcceptance: async () => ({ acceptanceId: 'offline-receipt', artifactId: 'offline-artifact' }),
      }
      const bridge = {
        advertisedProfile: profile.advertisedProfile,
        lastSubmissionCorrelation: { requestId: 'offline-request', idempotencyKey: 'offline-key' },
        reconcileSubmission: async () => ({
          outcome: 'ACCEPTED',
          receiptId: 'offline-receipt',
          artifactIds: ['offline-artifact'],
        }),
      }
      bridges.set(id, { fixture, bridge })
      return {
        handle: async () => ({ ok: true, value: {} }),
        bootstrapConfig: url => ({
          schema: 'appraise.m02-ta-bridge-bootstrap/v1',
          caseId: id,
          capability: 'c'.repeat(48),
          url,
        }),
        auditCapability: () => 'a'.repeat(43),
        ready: async () => ({ fixture, bridge }),
        close: async () => {},
      }
    },
  }
  const createObserver = ({ spawnOwnedCodex }) => ({
    spawn: async () => {
      const owned = await spawnOwnedCodex()
      return {
        child: owned.child,
        assertLiveHostBeforeCaseComplete: () => ({
          evidenceClass: 'SYNTHETIC_OFFLINE_HOST_OBSERVATION',
          identity: { pid: 1 },
        }),
        stopAndVerify: async () => {
          await owned.stopOwned()
          return { originalHostGone: !failCleanup, evidenceClass: 'SYNTHETIC_OFFLINE_HOST_ABSENCE' }
        },
      }
    },
  })
  return {
    io,
    syncFs,
    canonical,
    createObserver,
    childReceipt,
    counts,
    operations,
    failures,
    settle: async () => {
      await Promise.all(tasks)
    },
  }
}
