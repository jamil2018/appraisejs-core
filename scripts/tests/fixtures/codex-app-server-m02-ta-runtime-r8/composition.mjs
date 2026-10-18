import { isAbsolute, join } from 'node:path'
import { POLICY, POLICY_DIGEST, casePolicy, digest } from './policy.mjs'

const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export function prepareTrustedComposition({ phase, artifacts = [], routeReview = null, outerCeilings = null } = {}) {
  if (!Object.hasOwn(POLICY.roots, phase)) throw new Error('unknown phase')
  const blockers = []
  if (
    artifacts.length === 0 ||
    artifacts.some(item => !isAbsolute(item.path ?? '') || !sha(item.sha256)) ||
    new Set(artifacts.map(item => item.path)).size !== artifacts.length ||
    !['codex', 'interpreter', 'supervisor', 'scoped-mcp-entry', 'policy', 'schema'].every(purpose =>
      artifacts.some(item => item.purpose === purpose),
    ) ||
    !artifacts.some(
      item =>
        item.purpose === 'codex' && item.path === POLICY.executable.path && item.sha256 === POLICY.executable.sha256,
    )
  )
    blockers.push('MISSING_EXACT_ARTIFACT_PINS')
  // Reviewed evidence is supplied by the trusted caller, not a host-authentication mechanism.
  const plannedOuter = Object.fromEntries(
    POLICY.cases.filter(item => item.phase === phase).map(item => [item.id, POLICY.outerCalls.ceilings[item.id]]),
  )
  if (outerCeilings !== null && digest(outerCeilings) !== digest(plannedOuter))
    blockers.push('OUTER_CEILINGS_DIFFER_FROM_REVIEWED_POLICY')
  outerCeilings = plannedOuter
  if (phase !== 'T1') {
    const records = routeReview?.records
    const roles =
      phase === 'T2'
        ? POLICY.cases.filter(item => /^B0[1-6]$/.test(item.id)).map(item => item.role)
        : ['REQUIREMENT_ANALYZER']
    if (
      routeReview?.evidenceClass !== 'ACTUAL_CAPTURE_REVIEWED' ||
      routeReview.expansion !== POLICY.outerCalls.expansion ||
      !sha(routeReview.reviewArtifactDigest) ||
      !Array.isArray(records) ||
      records.length !== roles.length ||
      new Set(records?.map(entry => entry.receipt?.role)).size !== roles.length ||
      roles.some(role => !records?.some(entry => entry.receipt?.role === role)) ||
      records?.some(entry => {
        const { capture, receipt } = entry
        return (
          capture?.status !== 'CAPTURED' ||
          !Array.isArray(capture.containers) ||
          !capture.containers.length ||
          !Array.isArray(capture.callables) ||
          !capture.callables.length ||
          capture.provenance?.binarySha256 !== `sha256:${POLICY.executable.sha256}` ||
          receipt?.status !== 'PREPARED_NOT_RUNTIME_QUALIFIED' ||
          receipt.version !== 'M02_TRUSTED_NATIVE_ROUTE_V1' ||
          receipt.requestByteHash !== capture.requestByteHash ||
          receipt.descriptorHash !== capture.descriptorHash ||
          receipt.containerHash !== capture.containerHash ||
          !/^sha256:[a-f0-9]{64}$/.test(receipt.advertisedProfileDigest ?? '') ||
          !Array.isArray(receipt.routes) ||
          !receipt.routes.length ||
          receipt.routes.some(
            route => route.mode === 'REVIEWED_WRAPPER' && route.wrapper?.provenance !== 'CAPTURED_REVIEWED',
          ) ||
          entry.artifactDigest !== digest({ capture, receipt })
        )
      })
    )
      blockers.push('BLOCKED_MISSING_ACTUAL_DESCRIPTORS_AND_ROUTE_REVIEW')
    if (
      phase === 'T3' &&
      (!routeReview?.workspaceCodecs ||
        ['N01', 'N02'].some(id => {
          const codec = routeReview.workspaceCodecs[id]
          return (
            !sha(codec?.implementationDigest) ||
            !/^sha256:[a-f0-9]{64}$/.test(codec?.descriptorHash ?? '') ||
            !records?.some(entry =>
              entry.capture?.callables?.some(tool => tool.descriptorHash === codec.descriptorHash),
            )
          )
        }))
    )
      blockers.push('MISSING_REVIEWED_NATIVE_WORKSPACE_CODECS')
  }
  const manifest = {
    version: POLICY.version,
    policyDigest: POLICY_DIGEST,
    phase,
    root: POLICY.roots[phase],
    cases: POLICY.cases.filter(item => item.phase === phase).map(item => item.id),
    artifacts: structuredClone(artifacts),
    routeReview: structuredClone(routeReview),
    outerCeilings: structuredClone(outerCeilings),
    runtimeAuthorized: false,
    evidenceClass: 'OFFLINE_PREPARED',
    hostIsolation: 'NOT_ATTESTED',
  }
  return Object.freeze({ manifest, manifestDigest: digest(manifest), blockers, runtimeEligible: false })
}

/** Build configuration only. No path, process, native login, or listener is touched. */
export function prepareTrustedCase(prepared, id, { port, mcpExecutable, mcpArgs = [] } = {}) {
  const item = casePolicy(id)
  if (
    prepared.manifestDigest !== digest(prepared.manifest) ||
    prepared.manifest.phase !== item.phase ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    !isAbsolute(mcpExecutable ?? '') ||
    !Array.isArray(mcpArgs) ||
    mcpArgs.some(value => typeof value !== 'string' || value.includes('\0'))
  )
    throw new Error('exact case/configuration binding required')
  const root = join(prepared.manifest.root, 'cases', id)
  const output = {
    id,
    role: item.role,
    cwd: join(root, 'workspace'),
    env: { HOME: join(root, 'home'), CODEX_HOME: join(root, 'codex'), TMPDIR: join(root, 'tmp') },
    config: {
      model: POLICY.model,
      model_reasoning_effort: POLICY.reasoning,
      approval_policy: id === 'B14' ? 'on-request' : 'never',
      sandbox_mode: 'workspace-write',
      model_provider: 'm02-scripted',
      model_providers: {
        'm02-scripted': {
          name: 'M02 local scripted fixture',
          base_url: `http://127.0.0.1:${port}/v1`,
          wire_api: 'responses',
          requires_openai_auth: false,
          request_max_retries: 0,
          stream_max_retries: 0,
        },
      },
      mcp_servers: {
        appraise_m02: {
          command: mcpExecutable,
          args: [...mcpArgs],
          required: true,
          env: { APPRAISE_M02_BOOTSTRAP_PATH: join(root, 'codex', 'mcp-bootstrap.json') },
        },
      },
    },
    operationalConfigurationOnly: true,
    containmentQualified: false,
  }
  output.threadStartParams = {
    cwd: output.cwd,
    model: POLICY.model,
    modelProvider: 'm02-scripted',
    approvalPolicy: output.config.approval_policy,
    sandbox: 'workspace-write',
    config: structuredClone(output.config),
  }
  return Object.freeze(output)
}

/** Injected transport/canonical ports; this coordinator never starts a native runtime by itself. */
export class TrustedCaseCoordinator {
  #journal
  #clock
  #started
  #phaseStarted
  #phase
  #lastTime
  #busy = false
  #schedule
  #cancel
  #reservations = new WeakMap()
  #onDeadline
  #deadlineTimer
  constructor({ journal, clock = Date.now, schedule = setTimeout, cancel = clearTimeout, onDeadline = null }) {
    if (!journal || typeof clock !== 'function') throw new Error('journal/clock required')
    this.#journal = journal
    this.#schedule = schedule
    this.#cancel = cancel
    this.#onDeadline = onDeadline
    this.#clock = clock
    this.#lastTime = clock()
  }
  async begin(id) {
    const item = casePolicy(id)
    if (this.#phase !== item.phase) {
      this.#phaseStarted = this.#clock()
      this.#phase = item.phase
    }
    await this.#journal.begin(id)
    this.#started = this.#clock()
    this.#lastTime = this.#started
    if (typeof this.#onDeadline === 'function') {
      if (this.#deadlineTimer) this.#cancel(this.#deadlineTimer)
      this.#deadlineTimer = this.#schedule(() => {
        try {
          if (!this.#journal.snapshot().fenced) this.#journal.markUnknown('case-deadline')
        } catch {
          /* keep uncertainty */
        }
        Promise.resolve()
          .then(this.#onDeadline)
          .catch(() => {})
      }, POLICY.deadlineMs.case)
      this.#deadlineTimer?.unref?.()
    }
  }
  async #check() {
    const now = this.#clock()
    if (
      !Number.isFinite(now) ||
      now < this.#lastTime ||
      now - this.#started >= POLICY.deadlineMs.case ||
      now - this.#phaseStarted >= POLICY.deadlineMs[this.#phase] ||
      this.#journal.snapshot().fenced
    ) {
      await this.#journal.markUnknown()
      throw new Error('campaign fenced; no resend')
    }
    this.#lastTime = now
  }
  consumeReservation(token, kind, id) {
    const record = token && this.#reservations.get(token)
    if (!record || record.used || record.kind !== kind || record.id !== id || this.#journal.snapshot().fenced)
      return false
    record.used = true
    return true
  }
  async perform(kind, id, effect, { related = [] } = {}) {
    if (this.#busy) {
      await this.#journal.markUnknown()
      throw new Error('concurrent effect fenced')
    }
    this.#busy = true
    let token
    try {
      await this.#check()
      await this.#journal.reserve(kind, id)
      if (
        related.length &&
        (kind !== 'codexStarts' ||
          related.length !== 1 ||
          related[0].kind !== 'mcpStarts' ||
          related[0].id !== `${id}-mcp`)
      )
        throw new Error('unreviewed related effect')
      for (const entry of related) await this.#journal.reserve(entry.kind, entry.id)
      token = Object.freeze({ kind, id })
      this.#reservations.set(token, { kind, id, used: false })
      await this.#check()
      let timer
      let result
      try {
        result = await Promise.race([
          effect(token),
          new Promise((_, reject) => {
            timer = this.#schedule(
              () => reject(new Error('effect deadline; UNKNOWN')),
              Math.max(
                0,
                Math.min(
                  POLICY.deadlineMs.case - (this.#clock() - this.#started),
                  POLICY.deadlineMs[this.#phase] - (this.#clock() - this.#phaseStarted),
                ),
              ),
            )
          }),
        ])
      } finally {
        if (timer !== undefined) this.#cancel(timer)
      }
      await this.#check()
      if (result?.acknowledged !== false) await this.#journal.acknowledge(id)
      return result
    } catch (error) {
      try {
        await this.#journal.markUnknown()
      } catch {
        /* existing fence and reservations remain */
      }
      throw error
    } finally {
      if (token) this.#reservations.delete(token)
      this.#busy = false
    }
  }
  async complete({ outcome, cleanupKnown, verifyCanonical = null, verifyEvidence = null }) {
    await this.#check()
    if (typeof verifyEvidence !== 'function' || !(await verifyEvidence())) {
      await this.#journal.markUnknown()
      throw new Error('authoritative outcome and cleanup evidence required')
    }
    if (outcome === 'accepted' && (typeof verifyCanonical !== 'function' || !(await verifyCanonical()))) {
      await this.#journal.markUnknown()
      throw new Error('independent canonical acceptance required')
    }
    await this.#check()
    await this.#journal.finish({ outcome, cleanupKnown })
    if (this.#deadlineTimer) this.#cancel(this.#deadlineTimer)
  }
  async denyPermission({ requestId, threadId, expectedThreadId, turnId, expectedTurnId, send }) {
    if (
      this.#journal.snapshot().activeCase !== 'B14' ||
      !(
        (Number.isSafeInteger(requestId) && requestId >= 0) ||
        (typeof requestId === 'string' && /^[A-Za-z0-9._:-]{1,80}$/.test(requestId))
      ) ||
      typeof expectedThreadId !== 'string' ||
      !expectedThreadId ||
      typeof expectedTurnId !== 'string' ||
      !expectedTurnId ||
      threadId !== expectedThreadId ||
      turnId !== expectedTurnId
    ) {
      await this.#journal.markUnknown()
      throw new Error('unexpected permission request')
    }
    return this.perform('permissionReplies', `permission-${requestId}`, reservation =>
      send({ id: requestId, result: { permissions: {}, scope: 'turn' } }, reservation),
    )
  }
}
