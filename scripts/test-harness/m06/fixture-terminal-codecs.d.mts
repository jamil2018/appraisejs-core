export type ServiceTerminalScope = Readonly<{
  case: string
  pid: number
  nonce: string
  terminalType: 'case-known-closed' | 'case-retained'
  terminalSequence: number
  expectedFixtureSha256: string
}>
export type ServiceTerminalAck = ServiceTerminalScope & Readonly<{ type: 'terminal-ack' }>
export type ServiceTerminalHandoff = ServiceTerminalScope & Readonly<{ type: 'terminal-handoff'; sequence: number }>
export type ServiceCallbackScope = ServiceTerminalScope & Readonly<{ ownerScript: string; handoffSequence: number }>
export type ServiceCallbackReceipt = ServiceCallbackScope &
  Readonly<{
    version: 1
    type: 'owner-terminal-callback-commit'
    phase: 'OWNER_HANDOFF_SEND_CALLBACK_COMMITTED'
  }>
export type SourceRetentionScope = Readonly<{ nonce: string; pid: number; selected: string }>
export type SourceRetentionBinding = SourceRetentionScope & Readonly<{ resultBytes: string; resultDigest: string }>
export type SourceRetentionResult = Readonly<
  SourceRetentionScope & { status: 'EXPECTED_RETENTION_LIVENESS_UNVERIFIED'; [key: string]: unknown }
>
export function createSourceRetentionBinding(
  identity: SourceRetentionScope,
  resultBytes: string,
): SourceRetentionBinding
export function decodeSourceRetentionResult(binding: SourceRetentionBinding): SourceRetentionResult
export function encodeServiceTerminalAck(scope: ServiceTerminalScope): ServiceTerminalAck
export function decodeServiceTerminalAck(raw: unknown, scope: ServiceTerminalScope): ServiceTerminalAck
export function decodeServiceTerminalHandoff(raw: unknown, scope: ServiceTerminalScope): ServiceTerminalHandoff
export function assertServiceCallbackReceipt(
  commit: unknown,
  failure: unknown,
  scope: ServiceCallbackScope,
): ServiceCallbackReceipt
export function decodeSourceRetentionPreliminary(raw: unknown, scope: SourceRetentionScope): SourceRetentionBinding
export function decodeSourceRetentionHandoff(raw: unknown, scope: SourceRetentionScope): SourceRetentionBinding

export type SourceRetentionTuple = SourceRetentionScope & Readonly<{ resultDigest: string }>
export type SourceRetentionPreliminary = SourceRetentionBinding & Readonly<{ type: 'EXPECTED_RETENTION_PRELIMINARY' }>
export type SourceRetentionHandoff = SourceRetentionBinding & Readonly<{ type: 'EXPECTED_RETENTION_HANDOFF' }>
export type SourceRetentionAck = SourceRetentionTuple & Readonly<{ type: 'ACK_EXPECTED_RETENTION' }>
export type SourceRetentionCallbackCommit = SourceRetentionTuple &
  Readonly<{ version: 1; type: 'OWNER_RETENTION_CALLBACK_COMMIT'; successCallbackObserved: true }>
export type SourceOwnerFailure = SourceRetentionScope &
  Readonly<{
    status: 'FAIL_RETENTION_REQUESTED_LIVENESS_UNVERIFIED'
    phase: string
    actualPromisesRetained: number
    passiveReferencesRetained: number
    originalCaptured: boolean
    error: string
    admission?: unknown
  }>
export function encodeSourceRetentionPreliminary(binding: SourceRetentionBinding): SourceRetentionPreliminary
export function decodeSourceRetentionAck(raw: unknown, binding: SourceRetentionTuple): SourceRetentionAck
export function encodeSourceRetentionHandoff(binding: SourceRetentionBinding): SourceRetentionHandoff
export function encodeSourceRetentionCallbackCommit(binding: SourceRetentionTuple): string
export function decodeSourceRetentionCallbackCommit(
  raw: unknown,
  binding: SourceRetentionTuple,
): SourceRetentionCallbackCommit
export function decodeSourceOwnerFailure(raw: unknown, identity: SourceRetentionScope): SourceOwnerFailure
export function assertSourceRetentionHandoffMatch(final: SourceRetentionBinding, binding: SourceRetentionBinding): void
