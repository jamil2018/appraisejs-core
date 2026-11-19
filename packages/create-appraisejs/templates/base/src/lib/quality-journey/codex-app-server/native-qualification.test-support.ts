import { createHash } from 'node:crypto'
import { chmodSync, lstatSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeNativeCredential } from './native-credential-topology'
import {
  nativeQualificationInputPaths,
  renderNativeQualificationConfiguration,
  type NativeQualificationManifest,
} from './native-qualification-contract'

const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
export function syntheticNativeManifest() {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'appraise-c0-synthetic-')))
  const credential = path.join(parent, 'synthetic-auth.json'),
    executable = path.join(parent, 'synthetic-native'),
    database = path.join(parent, 'disposable.db')
  writeFileSync(credential, 'synthetic credential bytes are never inspected', { mode: 0o600 })
  chmodSync(credential, 0o600)
  writeFileSync(executable, 'This synthetic executable must never be executed', { mode: 0o700 })
  writeFileSync(database, '')
  const metadata = lstatSync(database, { bigint: true })
  const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '')
  const prerequisite = path.join(parent, 'synthetic-receipt.json')
  writeFileSync(prerequisite, '{}')
  const manifest: NativeQualificationManifest = {
    version: 'appraise.native-qualification/v1',
    campaignId: 'synthetic',
    repositoryRoot,
    freshRoot: path.join(parent, 'fresh'),
    candidateTree: 'a'.repeat(40),
    native: { path: executable, sha256: sha(readFileSync(executable)) },
    prerequisites: {
      readinessReceipt: { path: prerequisite, sha256: sha('{}') },
      existingLoginReceipt: { path: prerequisite, sha256: sha('{}') },
    },
    database: { path: database, dev: String(metadata.dev), ino: String(metadata.ino) },
    binding: {
      journeyId: 'journey',
      targetProjectId: 'project',
      coordinatorSessionId: 'session',
      coordinatorGeneration: 1,
      workItemId: 'item',
      attemptId: 'attempt',
      assignmentId: 'assignment',
      assignmentGeneration: 1,
      leaseId: 'lease',
      role: 'REQUIREMENT_ANALYZER',
    },
    inputs: nativeQualificationInputPaths(repositoryRoot).map(path => ({ path, sha256: sha(readFileSync(path)) })),
    configurationSha256: '0'.repeat(64),
    credentialSource: describeNativeCredential(credential),
    endpoint: {
      host: '127.0.0.1',
      port: 39187,
      path: `/appraise-worker/${'a'.repeat(32)}`,
      serverName: 'appraise_worker',
      capabilityCommitment: `sha256:${sha('b'.repeat(64))}`,
    },
    envelopeDigest: `sha256:${'e'.repeat(64)}`,
    roleProfileDigest: `sha256:${'f'.repeat(64)}`,
    mcpPromptBypass: 'EXACT_ENABLED_TOOLS_APPROVE',
    enabledTools: ['quality_journey_analysis_get', 'quality_journey_analysis_submit'],
    limits: {
      acquisitionMs: 1000,
      caseMs: 10000,
      requestMs: 1000,
      acknowledgementMs: 1000,
      cleanupMs: 1000,
      bodyBytes: 1048576,
      httpRequests: 32,
      toolCalls: 4,
    },
    allowance: {
      acquisitions: 1,
      threads: 1,
      consumingTurns: 1,
      accountRequests: 0,
      resumes: 0,
      executionCalls: 0,
      correctionCalls: 0,
    },
  }
  manifest.configurationSha256 = sha(renderNativeQualificationConfiguration(manifest, 'b'.repeat(64)))
  return { manifest, capability: 'b'.repeat(64), parent, credential, sha }
}
