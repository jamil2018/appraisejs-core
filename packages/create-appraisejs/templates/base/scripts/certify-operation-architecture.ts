#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  builtInStepDefinitions,
  stepDefinitionContentHash,
} from '../packages/cucumber-runtime/src/step-definitions/index'
import { defaultOperationRegistry } from '../src/lib/operation-catalog/default-operation-registry'
import { operationArchitectureDigest, runArchitectureScript } from './lib/operation-architecture-utils'

type CapabilityLedger = {
  ledgerHash: string
  sources: { stepDefinitionSourceHash: string; operationRegistryHash: string }
  summary: { builtInStepDefinitions: number; trustedHandlers: number; structuredOperationCases: number }
  rows: Array<{ reference: string; definitionHash: string; humanSignature: string; execution: { handler: string } }>
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ledgerPath = path.join(repoRoot, 'config', 'operation-capability-ledger.json')
const receiptPath = path.join(repoRoot, 'config', 'operation-architecture-certification.json')
const runtimeEvidenceSuites = [
  'packages/cucumber-runtime/src/step-definitions/dispatcher.test.ts',
  'src/services/step-definition/step-definition-registry-service.integration.test.ts',
  'src/services/coordinator/coordinator-step-definition-service.test.ts',
  'src/lib/runtime-capsule/runtime-capsule.test.ts',
  'src/components/diagram/flow-diagram.test.tsx',
] as const

const forbiddenLegacySymbols = [
  'submitForReview(',
  'legacyRuntimeExtensionArtifact',
  // Validation AST accepts exact Step References only; the removed action
  // reference schema must not return through root, package, docs, or schema
  // surfaces. Historical migration notes are the sole documented exception.
  'actionReferenceSchema',
] as const

const repositoryAbsenceAllowlist = [
  /^codex\/development plan\/.*\.md$/,
  // The certification source necessarily names the forbidden tokens it scans.
  /^scripts\/certify-operation-architecture\.ts$/,
  /^packages\/create-appraisejs\/templates\/base\/scripts\/certify-operation-architecture\.ts$/,
] as const

async function repositoryAbsenceGate() {
  const sources = await Promise.all(
    [repoRoot].map(async directory => {
      const result: string[] = []
      const ignored = new Set(['.git', 'node_modules', '.next', 'coverage', 'dist', 'graphify-out'])
      const visit = async (current: string): Promise<void> => {
        for (const entry of await fs.readdir(current, { withFileTypes: true })) {
          const target = path.join(current, entry.name)
          if (entry.isDirectory() && !ignored.has(entry.name)) await visit(target)
          else if (/\.(?:ts|tsx|mjs|mts|cts|md|json|prisma|ya?ml)$/.test(entry.name)) result.push(target)
        }
      }
      await visit(directory)
      return result
    }),
  )
  const matches: string[] = []
  for (const source of sources.flat()) {
    const content = await fs.readFile(source, 'utf8')
    const relative = path.relative(repoRoot, source)
    if (repositoryAbsenceAllowlist.some(pattern => pattern.test(relative))) continue
    for (const symbol of forbiddenLegacySymbols) if (content.includes(symbol)) matches.push(`${relative}:${symbol}`)
  }
  return {
    passed: matches.length === 0,
    matches,
    scannedRoots: ['.'],
    allowlist: repositoryAbsenceAllowlist.map(pattern => pattern.source),
  }
}

async function runtimeEvidence() {
  const sourceHashes = await Promise.all(
    runtimeEvidenceSuites.map(async suite => ({
      suite,
      sourceHash: operationArchitectureDigest(await fs.readFile(path.join(repoRoot, suite), 'utf8')),
    })),
  )
  return {
    command: `node node_modules/vitest/vitest.mjs run ${runtimeEvidenceSuites.join(' ')}`,
    suites: sourceHashes,
    scenarios: [
      'built-in exact invocation',
      'human and agent authored review receipts',
      'reviewed-extension and composition dispatch',
      'deprecated dependency rejection',
      'handler readiness, receipt replay, and publication rollback',
    ],
  }
}

function runRuntimeEvidence(): void {
  const vitestEntry = path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs')
  execFileSync(process.execPath, [vitestEntry, 'run', ...runtimeEvidenceSuites], {
    cwd: repoRoot,
    env: { ...process.env, TMPDIR: process.env.TMPDIR ?? '/tmp' },
    stdio: 'inherit',
  })
}

export async function buildOperationArchitectureCertification() {
  const ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8')) as CapabilityLedger
  const expectedReferences = builtInStepDefinitions
    .map(definition => `${definition.identity.id}@${definition.identity.version}`)
    .sort()
  const actualReferences = ledger.rows.map(row => row.reference).sort()
  const allBuiltInsAccountedFor =
    expectedReferences.length === actualReferences.length &&
    expectedReferences.every((reference, index) => reference === actualReferences[index])
  const uniqueHumanSignatures = new Set(ledger.rows.map(row => row.humanSignature)).size === ledger.rows.length
  const exactDefinitionHashes = ledger.rows.every(row => {
    const definition = builtInStepDefinitions.find(
      item => `${item.identity.id}@${item.identity.version}` === row.reference,
    )
    return definition && stepDefinitionContentHash(definition) === row.definitionHash
  })
  const evidence = await runtimeEvidence()
  const absence = await repositoryAbsenceGate()
  const body = {
    schemaVersion: 3,
    status:
      allBuiltInsAccountedFor && uniqueHumanSignatures && exactDefinitionHashes
        ? ('certified' as const)
        : ('invalid' as const),
    hashes: {
      capabilityLedger: ledger.ledgerHash,
      stepDefinitionSource: stepDefinitionContentHash(builtInStepDefinitions),
      operationRegistry: defaultOperationRegistry.manifestHash,
    },
    counts: {
      builtInStepDefinitions: builtInStepDefinitions.length,
      trustedHandlers: ledger.summary.trustedHandlers,
      structuredOperationCases: ledger.summary.structuredOperationCases,
      humanSignatures: new Set(ledger.rows.map(row => row.humanSignature)).size,
    },
    gates: {
      canonicalSourceHashMatches:
        ledger.sources.stepDefinitionSourceHash === stepDefinitionContentHash(builtInStepDefinitions),
      allBuiltInsAccountedFor,
      exactDefinitionHashes,
      uniqueHumanSignatures,
      everyDefinitionHasTrustedHandler: ledger.rows.every(row => Boolean(row.execution.handler)),
      runtimeEvidenceSuitesBound: evidence.suites.length === runtimeEvidenceSuites.length,
      legacyAuthorityAndArtifactSurfacesAbsent: absence.passed,
    },
    runtimeEvidence: evidence,
    repositoryAbsence: absence,
  }
  if (Object.values(body.gates).some(passed => !passed)) {
    throw new Error('Step Definition architecture invariant failed before certification.')
  }
  return { ...body, receiptHash: operationArchitectureDigest(body) }
}

async function main() {
  runRuntimeEvidence()
  const receipt = await buildOperationArchitectureCertification()
  const rendered = `${JSON.stringify(receipt, null, 2)}\n`
  if (process.argv.includes('--check')) {
    const current = await fs.readFile(receiptPath, 'utf8').catch(() => '')
    if (current !== rendered) {
      throw new Error('Step Definition architecture certification is stale. Run npm run operation:certify.')
    }
  } else {
    await fs.writeFile(receiptPath, rendered)
  }
  console.log(`Step Definition architecture ${receipt.status} (${receipt.receiptHash}).`)
}

runArchitectureScript(import.meta.url, main)
