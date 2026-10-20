/** Bounded second-stage static-text-shape observation; never returns raw text or asserts its origin. */
import fs from 'node:fs'
import path from 'node:path'
import { parseStrictJson } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { observeR24History, FIXED_HISTORY } from './history-observation.mjs'

const MAX = 1024 * 1024
const literals = new Map([
  ['MCP tool call requires approval, but approval policy is never', 'POLICY_NEVER_LITERAL'],
  ['MCP tool call blocked by app configuration', 'APP_DISABLED_LITERAL'],
  ['user cancelled MCP tool call', 'APPROVAL_ABORT_LITERAL'],
  ['user rejected MCP tool call', 'APPROVAL_DECLINED_LITERAL'],
  [
    'MCP tool approval via request_user_input requires the root thread. Ask the parent agent to handle this request. Do not retry the blocked action until the parent confirms the blocker is resolved.',
    'NON_ROOT_LITERAL',
  ],
])

export function observeR24ErrorLiteral(source) {
  const observation = observeR24History(source)
  const result = {
    ...observation,
    schema: 'appraise.m02-r24-private-history-error-literal/v1',
    errorTextShape: 'UNAVAILABLE',
    turnApprovalPolicy: 'UNAVAILABLE',
    errorOrigin: 'UNATTESTED',
  }
  if (
    observation.status !== 'OBSERVED' ||
    observation.envelopeCorrelation !== 'EXACT' ||
    observation.isError !== 'TRUE' ||
    observation.contentShape !== 'TEXT_ONLY'
  )
    return result
  try {
    const rows = source.slice(0, -1).split('\n').map(parseStrictJson)
    const outputs = rows.filter(
      x =>
        x?.type === 'response_item' &&
        x.payload?.type === 'custom_tool_call_output' &&
        x.payload.call_id === 'm02_B01_0',
    )
    if (outputs.length !== 1) return result
    const nested = parseStrictJson(outputs[0].payload.output[1].text).result
    result.errorTextShape =
      nested.content.length === 1 ? (literals.get(nested.content[0].text) ?? 'UNCLASSIFIED') : 'UNCLASSIFIED'
    const contexts = rows.filter(x => x?.type === 'turn_context')
    result.turnApprovalPolicy =
      contexts.length === 0
        ? 'UNAVAILABLE'
        : contexts.every(x => x.payload?.approval_policy === 'never')
          ? 'NEVER'
          : 'OTHER'
    return result
  } catch {
    return { ...result, status: 'REFUSED' }
  }
}

function readWithIO(io) {
  const root = '/private/tmp/appraise-m02-ta-matrix-p10'
  for (let dir = path.dirname(FIXED_HISTORY); ; dir = path.dirname(dir)) {
    const s = io.lstatSync(dir)
    if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== process.getuid() || (s.mode & 0o777) !== 0o700)
      throw new Error('HISTORY_IDENTITY_REFUSED')
    if (dir === root) break
    if (dir === path.dirname(dir)) throw new Error('HISTORY_ANCESTRY_REFUSED')
  }
  const before = io.lstatSync(FIXED_HISTORY)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== process.getuid() ||
    (before.mode & 0o777) !== 0o600 ||
    before.nlink !== 1 ||
    before.size > MAX
  )
    throw new Error('HISTORY_IDENTITY_REFUSED')
  const same = s => ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs'].every(k => s[k] === before[k])
  const fd = io.openSync(FIXED_HISTORY, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    if (!same(io.fstatSync(fd))) throw new Error('HISTORY_IDENTITY_REFUSED')
    const bytes = io.readFileSync(fd)
    if (bytes.length !== before.size || !same(io.fstatSync(fd)) || !same(io.lstatSync(FIXED_HISTORY)))
      throw new Error('HISTORY_IDENTITY_REFUSED')
    return observeR24ErrorLiteral(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new Error('HISTORY_OBSERVATION_REFUSED')
  } finally {
    io.closeSync(fd)
  }
}

/** Test IO is injectable; the actual fixed read supplies no overrides and grants no runtime authority. */
export function readFixedR24ErrorLiteral(io = fs) {
  try {
    return readWithIO(io)
  } catch {
    throw new Error('HISTORY_OBSERVATION_REFUSED')
  }
}
