import { createHash } from 'node:crypto'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import ts from 'typescript'

const CUSTOM_EXTENSION_POLICY_VERSION = '1' as const
export const CUSTOM_EXTENSION_RUNTIME_DECLARATIONS = [
  "declare module '@cucumber/cucumber' { export const Given: (...args: unknown[]) => void; export const When: (...args: unknown[]) => void; export const Then: (...args: unknown[]) => void; export const Before: (...args: unknown[]) => void; export const After: (...args: unknown[]) => void; }",
  "declare module '@playwright/test' { export const expect: (actual: unknown) => unknown; }",
].join('\n')

export type CustomExtensionPolicy = {
  version: typeof CUSTOM_EXTENSION_POLICY_VERSION
  projectId: string
  projectFingerprint: string
  capabilityImports: Readonly<Record<string, readonly string[]>>
  compilerVersion: string
  declarationHash: string
  contentHash: string
}

export function createCustomExtensionPolicy(input: {
  projectId: string
  projectFingerprint: string
  capabilityImports: Readonly<Record<string, readonly string[]>>
}): CustomExtensionPolicy {
  const contract = {
    version: CUSTOM_EXTENSION_POLICY_VERSION,
    projectId: input.projectId,
    projectFingerprint: input.projectFingerprint,
    capabilityImports: Object.fromEntries(
      Object.entries(input.capabilityImports)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([capability, imports]) => [capability, [...imports].sort()]),
    ),
    compilerVersion: ts.version,
    declarationHash: `sha256:${createHash('sha256').update(CUSTOM_EXTENSION_RUNTIME_DECLARATIONS).digest('hex')}`,
  }
  return {
    ...contract,
    contentHash: `sha256:${createHash('sha256').update(canonicalContractJson(contract)).digest('hex')}`,
  }
}

export function assertValidCustomExtensionPolicy(policy: CustomExtensionPolicy): void {
  const expected = createCustomExtensionPolicy({
    projectId: policy.projectId,
    projectFingerprint: policy.projectFingerprint,
    capabilityImports: policy.capabilityImports,
  })
  if (canonicalContractJson(policy) !== canonicalContractJson(expected))
    throw new Error('Custom extension policy authority is invalid or stale.')
}
