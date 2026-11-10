import type { SourceLaunchCustody, SourceLaunchIdentity, SourceLaunchBoundary } from './source-custody-launch.mjs'
export type SourceDirectGuard = Readonly<{
  failed: boolean
  firstError: unknown
  fail(error: unknown): void
  assertActive(): void
  bind(custody: SourceLaunchCustody): void
  complete(): void
}>
export function createSourceDirectGuard(): SourceDirectGuard
export function runSourceDirectEntry(operation: (guard: SourceDirectGuard) => unknown): SourceDirectGuard

export function createSourceControllerBoundary(
  guard: SourceDirectGuard,
  identity: SourceLaunchIdentity,
): SourceLaunchBoundary
