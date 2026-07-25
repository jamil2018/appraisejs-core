import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { CUSTOM_EXTENSION_RUNTIME_DECLARATIONS } from '@/lib/validation-ast/extension-policy'
import type { CapsuleCommandReceiptV1 } from './command-receipt-contract'
import { canonicalRuntimeCapsuleJson, hashRuntimeCapsuleBytes } from './contracts'
import type { resolveCapsuleRuntimeIdentity } from './runtime-identity'
import type { RuntimeCapsuleManifest } from './contracts'

const require = createRequire(import.meta.url)
const hashText = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`

export function validateRuntimeIdentity(
  receipt: CapsuleCommandReceiptV1,
  current: Awaited<ReturnType<typeof resolveCapsuleRuntimeIdentity>>,
) {
  for (const [actual, sealed] of [
    [current.node, receipt.runtime.node],
    [current.cucumber, receipt.runtime.cucumber],
    [current.appraiseRuntime, receipt.runtime.appraiseRuntime],
    [current.appraiseHooks, receipt.runtime.appraiseHooks],
  ])
    if (canonicalRuntimeCapsuleJson(actual) !== canonicalRuntimeCapsuleJson(sealed))
      throw new Error('runtime identity drift')
}

/**
 * The manifest schema verifies the complete immutable Step Definition closure.
 * There is intentionally no second operation registry closure to drift from it.
 */
export function validateOperationClosure(manifest: RuntimeCapsuleManifest) {
  if (!manifest.stepDefinitions.length) throw new Error('Step Definition closure is missing.')
}

export function validateCucumberSingleton(
  receipt: CapsuleCommandReceiptV1,
  current: Awaited<ReturnType<typeof resolveCapsuleRuntimeIdentity>>,
) {
  if (
    receipt.runtime.moduleImports.length !== 3 ||
    receipt.runtime.cucumber.singletonKey !== current.cucumber.singletonKey ||
    receipt.runtime.moduleImports.some(item => {
      const identity =
        item.packageName === '@cucumber/cucumber'
          ? current.cucumber
          : item.specifier.endsWith('/hooks')
            ? current.appraiseHooks
            : current.appraiseRuntime
      return (
        item.resolvedRealPath !== identity.realPath || item.hash !== identity.hash || item.version !== identity.version
      )
    })
  )
    throw new Error('multiple or drifted Cucumber instances')
}

export function expectedConfigSource(receipt: CapsuleCommandReceiptV1) {
  const base = {
    paths: receipt.command.features.map(file => file.path),
    import: [...receipt.command.imports, ...receipt.command.support].map(file => file.path),
    format: [`json:${receipt.outputs.report.path}`],
    publishQuiet: true,
  }
  return `export default ${canonicalRuntimeCapsuleJson(base)}\nexport const preflight = ${canonicalRuntimeCapsuleJson({ ...base, format: [`json:${receipt.outputs.preflight.path}`] })}\n`
}

export function validateCompilerIdentity(receipt: CapsuleCommandReceiptV1) {
  const compiler = receipt.runtime.compiler
  const typescriptVersion = (require('typescript/package.json') as { version: string }).version
  if (
    receipt.runtime.loaders.length !== 1 ||
    receipt.runtime.loaders[0]?.kind !== 'native-esm' ||
    receipt.runtime.loaders[0].version !== process.versions.modules ||
    compiler.kind !== 'precompiled-js' ||
    compiler.typescriptVersion !== typescriptVersion ||
    compiler.declarationBundleHash !== hashText(CUSTOM_EXTENSION_RUNTIME_DECLARATIONS) ||
    compiler.extensionCompilerVersion !== ts.version ||
    ts.version !== typescriptVersion
  )
    throw new Error('compiler identity drift')
}

export function resolveSealedEnvironment(receipt: CapsuleCommandReceiptV1): Record<string, string> {
  const env: Record<string, string> = {}
  for (const entry of receipt.environment.entries) {
    if (entry.source !== 'literal' || entry.value === undefined) throw new Error('unresolved environment reference')
    if (hashRuntimeCapsuleBytes(Buffer.from(entry.value)) !== entry.expectedDigest)
      throw new Error('environment value drift')
    env[entry.key] = entry.value
  }
  if (
    canonicalRuntimeCapsuleJson(Object.keys(env).sort()) !==
      canonicalRuntimeCapsuleJson(receipt.environment.allowlist) ||
    receipt.capabilities.process.spawn ||
    receipt.capabilities.process.shell ||
    receipt.capabilities.process.childProcess ||
    canonicalRuntimeCapsuleJson(receipt.capabilities.imports.allowed) !==
      canonicalRuntimeCapsuleJson(receipt.runtime.moduleImports.map(item => item.resolvedRealPath).sort())
  )
    throw new Error('capability mismatch')
  if (!receipt.capabilities.network.allowedOrigins.includes(new URL(env.APPRAISE_BASE_URL!).origin))
    throw new Error('origin denied')
  return env
}

export function validateExpectedCaseEvidence(bytes: Buffer, receipt: CapsuleCommandReceiptV1) {
  if (hashRuntimeCapsuleBytes(bytes) !== receipt.outputs.evidence.expectedCasesHash)
    throw new Error('expected-case hash mismatch')
  const parsed = JSON.parse(bytes.toString('utf8'))
  if (
    canonicalRuntimeCapsuleJson(parsed) !== bytes.toString('utf8') ||
    canonicalRuntimeCapsuleJson(parsed) !== canonicalRuntimeCapsuleJson(receipt.selection.expectedCases)
  )
    throw new Error('expected-case set mismatch')
}
