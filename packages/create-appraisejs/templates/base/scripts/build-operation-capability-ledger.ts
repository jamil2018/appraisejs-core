#!/usr/bin/env tsx

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { listBrowserOperationHandlerRefs } from '../packages/cucumber-runtime/src/operations/index'
import { defaultOperationRegistry } from '../src/lib/operation-catalog/default-operation-registry'
import {
  operationArchitectureDigest,
  readAllOperationDescriptors,
  runArchitectureScript,
} from './lib/operation-architecture-utils'

type TemplateStep = {
  slug: string
  signature: string
  group: { slug: string }
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = path.join(repoRoot, 'config', 'operation-capability-ledger.json')

function legacyOperationRef(step: TemplateStep) {
  const operation =
    defaultOperationRegistry.resolveAlias('template-step-slug', step.slug, 'human') ??
    defaultOperationRegistry.resolveAlias('cucumber-signature', step.signature, 'human')
  if (!operation) throw new Error(`Template step ${step.slug} has no canonical operation mapping.`)
  return `${operation.id}@${operation.version}`
}

function mapLegacySteps(manifest: { steps: TemplateStep[] }) {
  const legacyByOperation = new Map<string, TemplateStep[]>()
  for (const step of manifest.steps) {
    const ref = legacyOperationRef(step)
    legacyByOperation.set(ref, [...(legacyByOperation.get(ref) ?? []), step])
  }
  return legacyByOperation
}

function capabilityRow(
  definition: ReturnType<typeof readAllOperationDescriptors>[number],
  legacyByOperation: Map<string, TemplateStep[]>,
  handlerSet: Set<string>,
) {
  const ref = `${definition.id}@${definition.version}`
  if (!handlerSet.has(ref)) throw new Error(`Operation ${ref} has no trusted handler.`)
  const legacySteps = (legacyByOperation.get(ref) ?? []).map(step => ({
    slug: step.slug,
    signature: step.signature,
    group: step.group.slug,
  }))
  const actionIds = definition.aliases
    .filter(alias => alias.kind === 'action-id')
    .map(alias => alias.value)
    .sort()
  return {
    canonicalOperation: ref,
    descriptorHash: definition.descriptorHash,
    handlerHash: definition.handler.contentHash,
    mappingKind: 'exact',
    reviewState: 'approved',
    reviewNote: legacySteps.length
      ? 'Built-in Gherkin is a generated human projection over the shared trusted operation handler.'
      : 'Managed-only capability has an explicit generated human projection over the shared trusted handler.',
    legacySteps,
    managedActions: actionIds.map(id => ({ id, version: definition.version })),
    humanAuthoring: 'native',
    agentAuthoring: 'native',
    capsuleExecution: 'shared-operation-handler',
    manualExecution: 'shared-operation-handler',
    migrationState: 'mapped',
  }
}

export async function buildOperationCapabilityLedger() {
  const manifest = JSON.parse(
    await fs.readFile(path.join(repoRoot, 'packages/appraisejs/registry/template-steps/manifest.json'), 'utf8'),
  ) as { version: number; steps: TemplateStep[] }
  const definitions = readAllOperationDescriptors()
  const handlers = listBrowserOperationHandlerRefs()
  const handlerSet = new Set(handlers)
  const legacyByOperation = mapLegacySteps(manifest)
  const rows = definitions.map(definition => capabilityRow(definition, legacyByOperation, handlerSet))

  const legacyOccurrences = rows.flatMap(row => row.legacySteps.map(step => step.slug))
  if (legacyOccurrences.length !== manifest.steps.length || new Set(legacyOccurrences).size !== manifest.steps.length)
    throw new Error('Every built-in template step must map exactly once to the canonical operation registry.')

  const managedActions = rows.flatMap(row => row.managedActions)
  const content = {
    schemaVersion: 2,
    summary: {
      operationRows: rows.length,
      legacyTemplateSteps: manifest.steps.length,
      managedActions: managedActions.length,
      capsuleDelegatedHandlers: handlers.length,
      structuredOperationCases: definitions.filter(item => item.securityClass === 'bounded-structured').length,
    },
    sources: {
      templateManifestVersion: manifest.version,
      operationRegistryHash: defaultOperationRegistry.manifestHash,
      capsuleDelegatedHandlerRefs: handlers,
    },
    rows: rows.sort((left, right) => left.canonicalOperation.localeCompare(right.canonicalOperation)),
  }
  return { ...content, ledgerHash: operationArchitectureDigest(content) }
}

async function main() {
  const ledger = await buildOperationCapabilityLedger()
  const rendered = `${JSON.stringify(ledger, null, 2)}\n`
  if (process.argv.includes('--check')) {
    const current = await fs.readFile(outputPath, 'utf8').catch(() => '')
    if (current !== rendered) throw new Error('Operation capability ledger is stale. Run npm run operation:ledger.')
    console.log(`Operation capability ledger is current (${ledger.ledgerHash}).`)
    return
  }
  await fs.writeFile(outputPath, rendered)
  console.log(`Wrote operation capability ledger (${ledger.ledgerHash}).`)
}

runArchitectureScript(import.meta.url, main)
