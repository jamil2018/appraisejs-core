#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { parseProjectToml, validateTomlBasicString } from './lib/toml-validator.mjs'

const repoRoot = process.cwd()
const roles = {
  investigator: { model: 'gpt-5.6-luna', effort: 'medium', sandbox: 'read-only' },
  solver: { model: 'gpt-5.6-sol', effort: 'high', sandbox: 'read-only' },
  executor: { model: 'gpt-5.6-terra', effort: 'medium', sandbox: 'workspace-write' },
  judge: { model: 'gpt-5.6-sol', effort: 'high', sandbox: 'read-only' },
}
const requiredInstructionTokens = {
  investigator: ['evidence ledger', 'remain read-only', 'Do not perform external writes'],
  solver: ['evidence ledger', 'invariants', 'Do not perform external writes'],
  executor: ['Do not perform external writes', 'Do not\nmodify `.codex/`'],
  judge: ['falsify', 'Do not perform external writes'],
}
const allowedAgentKeys = new Set([
  'name',
  'description',
  'developer_instructions',
  'model',
  'model_reasoning_effort',
  'sandbox_mode',
])

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8')
}

function parseAgentLine(line, relative, lineNumber) {
  const match = line.match(/^([a-z_]+)\s*=\s*(.*)$/)
  if (!match) throw new Error(`${relative}:${lineNumber}: unsupported TOML syntax`)
  const [, key, raw] = match
  if (!allowedAgentKeys.has(key)) throw new Error(`${relative}:${lineNumber}: unsupported key "${key}"`)
  return { key, raw }
}

function parseMultilineValue(lines, index, raw, key, relative) {
  const chunks = [raw.slice(3)]
  while (!chunks.at(-1).endsWith('"""')) {
    index += 1
    if (index >= lines.length) throw new Error(`${relative}: unterminated multiline string "${key}"`)
    chunks.push(lines[index])
  }
  chunks[chunks.length - 1] = chunks.at(-1).slice(0, -3)
  return { index, value: chunks.join('\n').trim() }
}

function parseAgentValue(lines, index, raw, key, relative) {
  if (raw.startsWith('"""')) return parseMultilineValue(lines, index, raw, key, relative)
  const quoted = raw.match(/^"([^"]*)"$/)
  if (!quoted) throw new Error(`${relative}:${index + 1}: "${key}" must be a quoted string`)
  return { index, value: quoted[1] }
}

function isIgnorableAgentLine(line) {
  return !line || line.startsWith('#')
}

function rejectDuplicateAgentKey(values, key, relative, lineNumber) {
  if (key in values) throw new Error(`${relative}:${lineNumber}: duplicate key "${key}"`)
}

function parseFlatAgentToml(contents, relative) {
  const values = {}
  const lines = contents.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (isIgnorableAgentLine(line)) continue
    const { key, raw } = parseAgentLine(line, relative, index + 1)
    rejectDuplicateAgentKey(values, key, relative, index + 1)
    const parsed = parseAgentValue(lines, index, raw, key, relative)
    index = parsed.index
    validateTomlBasicString(parsed.value, relative, index + 1)
    values[key] = parsed.value
  }
  return values
}

const failures = []
const config = read('.codex/config.toml')
let parsedConfig
try {
  parsedConfig = parseProjectToml(config)
} catch (error) {
  failures.push(error.message)
  parsedConfig = new Map()
}
const agentDefaults = parsedConfig.get('agents') ?? new Map()
const seenNames = new Set()

if (agentDefaults.get('enabled') !== true) failures.push('.codex/config.toml: agents.enabled must be true')
if (agentDefaults.get('max_concurrent_threads_per_session') !== 3) {
  failures.push('.codex/config.toml: max_concurrent_threads_per_session must be 3')
}
if (agentDefaults.get('default_subagent_model') !== 'gpt-5.6-terra') {
  failures.push('.codex/config.toml: default_subagent_model must be gpt-5.6-terra')
}
if (agentDefaults.get('default_subagent_reasoning_effort') !== 'medium') {
  failures.push('.codex/config.toml: default subagent reasoning must be medium')
}

for (const [role, expected] of Object.entries(roles)) {
  const relative = `.codex/agents/${role}.toml`
  let values
  try {
    values = parseFlatAgentToml(read(relative), relative)
  } catch (error) {
    failures.push(error.message)
    continue
  }

  for (const required of ['name', 'description', 'developer_instructions']) {
    if (!values[required]) failures.push(`${relative}: missing ${required}`)
  }
  if (values.name !== role) failures.push(`${relative}: name must be "${role}"`)
  if (seenNames.has(values.name)) failures.push(`${relative}: duplicate role name "${values.name}"`)
  seenNames.add(values.name)
  if (values.model !== expected.model) failures.push(`${relative}: expected model ${expected.model}`)
  if (values.model_reasoning_effort !== expected.effort) {
    failures.push(`${relative}: expected reasoning effort ${expected.effort}`)
  }
  if (values.sandbox_mode !== expected.sandbox) failures.push(`${relative}: expected sandbox ${expected.sandbox}`)
  for (const token of requiredInstructionTokens[role]) {
    if (!values.developer_instructions?.includes(token)) {
      failures.push(`${relative}: developer_instructions missing "${token}"`)
    }
  }

  const registration = parsedConfig.get(`agents.${role}`)
  if (!registration) failures.push(`.codex/config.toml: missing registration section for ${role}`)
  if (registration?.get('config_file') !== `agents/${role}.toml`) {
    failures.push(`.codex/config.toml: invalid config_file for ${role}`)
  }
  if (!registration?.get('description')) {
    failures.push(`.codex/config.toml: missing registration description for ${role}`)
  }
}

const skill = read('.agents/skills/swarm-orchestrator/SKILL.md')
const reference = read('.agents/skills/swarm-orchestrator/references/routing-and-evolution.md')
for (const token of [
  'no inherited parent transcript',
  'deterministic checks',
  'notify the user',
  'Durable ledger',
  'npm run swarm:record',
  'Note, notify, update',
  'Harness usability',
]) {
  if (!reference.includes(token)) failures.push(`swarm routing reference: missing "${token}"`)
}
for (const token of ['Never skip notification', 'explicit user guidance', 'harness usability']) {
  if (!skill.includes(token)) failures.push(`swarm skill: missing "${token}"`)
}

if (failures.length) {
  console.error('Swarm harness check failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Swarm harness check passed (${Object.keys(roles).length} roles validated).`)
