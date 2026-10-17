#!/usr/bin/env node

import fs from 'node:fs'
import { loadHarnessSelectionContracts } from './lib/harness-selection.mjs'
import { parseStrictArgs } from './lib/swarm-cli.mjs'

const values = parseStrictArgs(process.argv.slice(2), { 'host-support-file': {}, 'official-evidence-file': {} })
const contracts = loadHarnessSelectionContracts()
const host = values['host-support-file'] ? JSON.parse(fs.readFileSync(values['host-support-file'], 'utf8')) : null
const official = values['official-evidence-file']
  ? parseOfficialEvidence(JSON.parse(fs.readFileSync(values['official-evidence-file'], 'utf8')))
  : null
const catalogIds = new Set(contracts.catalog.models.map(model => model.id))
const defaults = new Set(
  Object.values(contracts.policy.defaults)
    .filter(item => item.model)
    .map(item => item.model),
)
const candidates = contracts.catalog.models
  .filter(model => model.status === 'active')
  .map(model => currencyCandidate(model, defaults, official, host))

function currencyCandidate(model, defaults, official, host) {
  const hostEfforts = host?.modelEfforts?.[model.id]
  const evaluationCandidate = isUnpromotedSol61(model.id, defaults)
  return {
    model: model.id,
    default: defaults.has(model.id),
    evaluationCandidate,
    newerThanCurrentDefault: evaluationCandidate,
    officialSource: model.availabilityEvidence,
    presentInOfficialEvidence: official ? official.models.includes(model.id) : null,
    hostEfforts: Array.isArray(hostEfforts) ? hostEfforts : null,
    hostAvailability: hostAvailability(host, hostEfforts),
  }
}

function isUnpromotedSol61(modelId, defaults) {
  return modelId === 'gpt-6.1-sol' && !defaults.has(modelId)
}

function hostAvailability(host, efforts) {
  if (!host?.modelEfforts) return 'unverified'
  return Array.isArray(efforts) ? 'advertised' : 'unavailable'
}

console.log(
  JSON.stringify(
    {
      catalogVersion: contracts.catalog.schemaVersion,
      policyVersion: contracts.policy.schemaVersion,
      automaticUpgrade: false,
      refreshedOfficialEvidence: official !== null,
      liveOfficialVerification: false,
      officialEvidence: official ? { checkedAt: official.checkedAt, sourceUrl: official.sourceUrl } : null,
      officialModelsAbsentFromCatalog: official ? official.models.filter(model => !catalogIds.has(model)) : null,
      note: official
        ? 'Supplied official evidence is compared with the reviewed catalog. Unlisted models require review; host advertisements are not execution receipts.'
        : 'Catalog evidence only. Supply --official-evidence-file to compare refreshed official guidance; host advertisements are not execution receipts.',
      candidates,
    },
    null,
    2,
  ),
)

function parseOfficialEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Official evidence must be an object')
  validateOfficialDate(value.checkedAt)
  validateOfficialUrl(value.sourceUrl)
  validateOfficialModels(value.models)
  return value
}

function validateOfficialDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))
    throw new Error('Official evidence checkedAt must be a valid YYYY-MM-DD date')
}

function validateOfficialUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('Official evidence sourceUrl must be an official OpenAI HTTPS URL')
  }
  if (
    url.protocol !== 'https:' ||
    !['learn.chatgpt.com', 'developers.openai.com', 'openai.com'].includes(url.hostname)
  ) {
    throw new Error('Official evidence sourceUrl must be an official OpenAI HTTPS URL')
  }
}

function validateOfficialModels(models) {
  if (!nonemptyModelList(models)) {
    throw new Error('Official evidence models must be a nonempty array of unique model IDs')
  }
  if (!models.every(validModelId)) {
    throw new Error('Official evidence models must be a nonempty array of unique model IDs')
  }
  if (new Set(models).size !== models.length) {
    throw new Error('Official evidence models must be a nonempty array of unique model IDs')
  }
}

function nonemptyModelList(models) {
  return Array.isArray(models) && models.length > 0
}

function validModelId(model) {
  return typeof model === 'string' && /^gpt-[a-zA-Z0-9.-]+$/.test(model)
}
