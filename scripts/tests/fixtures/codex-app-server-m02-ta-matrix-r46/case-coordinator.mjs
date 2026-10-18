import { POLICY, casePolicy } from './policy.mjs'

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
  async checkPhaseAdmission(phase) {
    const now = this.#clock()
    const campaign = this.#journal.snapshot()
    if (
      !['T1', 'T2', 'T3'].includes(phase) ||
      !Number.isFinite(now) ||
      !Number.isFinite(this.#lastTime) ||
      now < this.#lastTime ||
      campaign.fenced ||
      this.#busy ||
      campaign.activeCase != null ||
      (this.#phase !== undefined && this.#phase !== phase)
    ) {
      await this.#journal.markUnknown()
      throw new Error('phase admission fenced; no resend')
    }
    if (this.#phase === undefined) {
      this.#phaseStarted = now
      this.#phase = phase
    }
    if (now - this.#phaseStarted >= POLICY.deadlineMs[this.#phase]) {
      await this.#journal.markUnknown()
      throw new Error('phase admission deadline; no resend')
    }
    this.#lastTime = now
  }
  async begin(id) {
    const item = casePolicy(id)
    await this.checkPhaseAdmission(item.phase)
    await this.#journal.begin(id)
    this.#started = this.#clock()
    if (
      !Number.isFinite(this.#started) ||
      this.#started < this.#lastTime ||
      this.#started - this.#phaseStarted >= POLICY.deadlineMs[this.#phase]
    ) {
      await this.#journal.markUnknown()
      throw new Error('case admission clock or phase deadline; no resend')
    }
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
  async remainingCaseBudget() {
    await this.#check()
    return Math.min(
      POLICY.deadlineMs.case - (this.#lastTime - this.#started),
      POLICY.deadlineMs[this.#phase] - (this.#lastTime - this.#phaseStarted),
    )
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
