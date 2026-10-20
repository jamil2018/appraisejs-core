// Local fixture only: stdin role input contains no credentials or provider authority.
import readline from 'node:readline'
import fs from 'node:fs'
const mode = process.argv[2] ?? 'normal'
const threadId = 'm06-fixture-thread'
const turnId = 'm06-fixture-turn'
let starts = 0
const send = value => process.stdout.write(`${JSON.stringify(value)}\n`)
const reply = (id, result) => send({ id, result })
function fixtureIsolationChecked() {
  const platformKeys = process.platform === 'darwin' ? ['__CF_USER_TEXT_ENCODING'] : []
  const allowed = ['HOME', 'CODEX_HOME', 'TMPDIR', 'LANG', ...platformKeys]
  const dirs = [process.cwd(), process.env.HOME, process.env.CODEX_HOME, process.env.TMPDIR]
  const config = `${process.env.CODEX_HOME}/config.toml`
  // Keep checks lazy so failure retains the original short-circuit behavior.
  return [
    () => Object.keys(process.env).every(key => allowed.includes(key)),
    () => dirs.every(directory => (fs.statSync(directory).mode & 0o777) === 0o700),
    () => (fs.statSync(config).mode & 0o777) === 0o600,
    () => fs.readFileSync(config, 'utf8') === '',
  ].every(check => check())
}
function initialize(frame) {
  reply(frame.id, { userAgent: 'owned-m06-analysis-fixture', isolationChecked: fixtureIsolationChecked() })
}
function readEnvelope(frame) {
  const envelope = JSON.parse(frame.params.input[0].text)
  if (envelope.schemaVersion !== 'appraise.analysis-fixture-input/v1' || envelope.role !== 'REQUIREMENT_ANALYZER')
    process.exit(91)
  return envelope
}
function analysisCharter(envelope) {
  return {
    schemaVersion: 'appraise.quality-journey/v1',
    charterId: 'm06-analysis-charter',
    analysisRevisionId: 'm06-analysis-revision',
    journeyId: envelope.journeyId,
    targetProjectId: envelope.targetProjectId,
    cycleId: envelope.cycleId,
    requirementRevisionId: envelope.requirement.artifactId,
    objectives: [envelope.requirement.data.objective],
    scope: { included: ['Fixture analysis'], excluded: [] },
    actors: ['User'],
    requirements: [
      {
        requirementId: 'REQ-M06',
        statement: envelope.requirement.data.objective,
        sourceRefs: ['requirement:objective'],
      },
    ],
    obligations: [
      {
        obligationId: 'OBL-M06',
        requirementId: 'REQ-M06',
        statement: 'The clarified requirement has evidence.',
        acceptanceSignals: ['Recorded clarification'],
      },
    ],
    constraints: [],
    assumptions: [],
    risks: [],
    acceptanceSignals: ['Recorded clarification'],
    retiredRequirementIds: [],
    questions: [
      {
        questionId: 'm06-required-question',
        prompt: 'Which payment method is in scope?',
        required: true,
        rationale: 'Scope depends on this decision.',
      },
    ],
    resolvedQuestionAnswerIds: [],
  }
}
function candidateCharter(charter) {
  if (mode === 'canonical-invalid') charter.requirementRevisionId = 'foreign-requirement'
  return mode === 'invalid' ? {} : charter
}
function analysisCandidate(charter) {
  const projectedCharter = candidateCharter(charter)
  return {
    threadId: mode === 'wrong-thread' ? 'foreign-thread' : threadId,
    turnId: mode === 'wrong-turn' ? 'foreign-turn' : turnId,
    charter: projectedCharter,
  }
}
function emitCandidates(candidate, charter) {
  if (mode === 'missing') return
  send({ method: 'appraise/analysisCandidate', params: candidate })
  if (mode === 'duplicate') send({ method: 'appraise/analysisCandidate', params: candidate })
  if (mode === 'conflicting')
    send({
      method: 'appraise/analysisCandidate',
      params: { ...candidate, charter: { ...charter, assumptions: ['Changed'] } },
    })
}
function completeTurn(candidate, charter) {
  emitCandidates(candidate, charter)
  send({ method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'completed' } } })
}
function turn(frame) {
  if (++starts !== 1) process.exit(90)
  const charter = analysisCharter(readEnvelope(frame))
  const candidate = analysisCandidate(charter)
  const finish = () => completeTurn(candidate, charter)
  reply(frame.id, { turn: { id: turnId } })
  if (mode === 'delayed') setTimeout(finish, 500)
  else finish()
}
const handlers = {
  initialize,
  'thread/start': frame => reply(frame.id, { thread: { id: threadId } }),
  'turn/start': turn,
}
readline.createInterface({ input: process.stdin }).on('line', line => {
  const frame = JSON.parse(line)
  if (Object.hasOwn(handlers, frame.method)) handlers[frame.method](frame)
})
