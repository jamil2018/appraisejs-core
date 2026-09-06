import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  builtInMethodologyManifest,
  builtInMethodologyRef,
  methodologyManifestDigest,
} from '../src/lib/quality-design/methodology-registry'
import { canonicalContractJson } from '../src/lib/catalog-contracts'
import { resolveQualityOsBehavioralSuites } from '../src/lib/quality-os-certification-suites'

const receiptPath = resolve('config/quality-os-certification.json')
const behavioralSuites = resolveQualityOsBehavioralSuites(process.cwd())
const packageBehavioralSuites = [
  'src/coordinator-client.test.ts',
  'src/mcp/response-projector.test.ts',
  'src/mcp/registry.test.ts',
  'src/mcp-contract.test.ts',
  'src/mcp/quality-journey-discovery.test.ts',
  'src/mcp/quality-journey-library.test.ts',
  'src/mcp/quality-journey-compatibility.test.ts',
]
if (process.argv.includes('--check-suites')) {
  const missingSuites = behavioralSuites.filter(file => !existsSync(resolve(file)))
  if (missingSuites.length)
    throw new Error(`Quality OS certification suite files are missing: ${missingSuites.join(', ')}`)
  console.log(JSON.stringify({ behavioralSuites }, null, 2))
} else {
  execFileSync('npm', ['run', 'validate:unit', '--', ...behavioralSuites], { stdio: 'inherit' })
  const packageWorkspacePresent = existsSync(resolve('packages/appraisejs/package.json'))
  if (packageWorkspacePresent)
    execFileSync('npm', ['--prefix', 'packages/appraisejs', 'test', '--', ...packageBehavioralSuites], {
      stdio: 'inherit',
    })
  const certifiedSuites = [
    ...behavioralSuites,
    ...(packageWorkspacePresent ? packageBehavioralSuites.map(file => `packages/appraisejs/${file}`) : []),
  ]
  const suiteEvidence = certifiedSuites.map(file => ({
    file,
    sourceHash: `sha256:${createHash('sha256')
      .update(readFileSync(resolve(file)))
      .digest('hex')}`,
    result: 'PASS',
  }))
  const content = {
    schema: 'appraise.quality-os-certification/v1',
    methodology: builtInMethodologyRef,
    methodologyMethodIds: builtInMethodologyManifest.methods.map(method => method.id),
    suiteEvidence,
    checks: [
      'class_specific_semantic_planning_alignment',
      'irrelevant_plan_rejection',
      'shared_subject_wrong_quality_rejection',
      'irrelevant_requirement_query_rejection',
      'strict_requirement_analysis_contract',
      'deterministic_requirement_critique',
      'exact_hash_requirement_decision',
      'strict_validation_design_contract',
      'deterministic_validation_critique',
      'exact_hash_validation_decision',
      'manifest_bound_execution_consent',
      'committed_execution_consent_handoff',
      'sealed_evidence_failure_attribution',
      'target_defect_only_violation',
    ],
    result: methodologyManifestDigest(builtInMethodologyManifest) === builtInMethodologyRef.digest ? 'PASS' : 'FAIL',
  }
  const receipt = {
    ...content,
    receiptHash: `sha256:${createHash('sha256').update(canonicalContractJson(content)).digest('hex')}`,
  }
  const rendered = `${JSON.stringify(JSON.parse(canonicalContractJson(receipt)), null, 2)}\n`

  if (process.argv.includes('--check')) {
    if (readFileSync(receiptPath, 'utf8') !== rendered) throw new Error('Quality OS certification receipt is stale.')
  } else {
    writeFileSync(receiptPath, rendered)
  }

  if (receipt.result !== 'PASS') throw new Error('Quality OS methodology digest certification failed.')
}
