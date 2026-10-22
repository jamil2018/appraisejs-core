import type { SourceDirectGuard } from './source-custody-direct-entry.mjs'
export type SourceTransportRequest = Readonly<{
  version: 1
  nonce: string
  selected: string
  script: string
  execPath: string
}>
export type SourceCaseResult = {
  selected: string
  nonce: string
  supervisorPid: number
  ownerPid: number
  status: 'KNOWN_OWNER_EXIT0' | 'EXPECTED_RETAINED_SUPERVISOR_EXIT'
  directory: string
  canonicalInputDigest: string
}
export function validateSourceTransportResult(
  value: unknown,
  request: SourceTransportRequest,
  pid: number,
): SourceCaseResult
/** controllerScript is the calling controller own import.meta.url path, never request/argv/env input. */
export function readSourceTransportRequest(
  directory: string,
  selected: string,
  nonce: string,
  controllerScript: string,
): SourceTransportRequest
export function publishSourceTransportResult(
  request: SourceTransportRequest,
  directory: string,
  result: SourceCaseResult,
  guard: SourceDirectGuard,
): void
/** Only the fixed calling controller supplies its own script identity; there is no fallback/script selector. */
export function runSourceCustodyTransport(selected: string, controllerScript: string): Promise<SourceCaseResult>
