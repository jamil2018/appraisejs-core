import type { ChildProcess } from 'node:child_process'
export type SourceLaunchRole = 'setup' | 'owner' | 'inspector' | 'supervisor'
export type SourceLaunchStage =
  | 'direct-process'
  | 'child-error'
  | 'error-listener'
  | 'SPECIFICATION'
  | 'stdout-open'
  | 'stderr-open'
  | 'fork'
  | 'spawn'
  | 'stdout-close'
  | 'stderr-close'
  | 'complete'
  | 'known-exit'
  | 'owner-observation'
  | 'supervisor-continuation'
  | 'campaign-continuation'
  | 'fault-observation'
  | 'fault-supervisor-continuation'
  | 'fault-campaign-continuation'
  | 'failure-reporter'
export type SourceLaunchIdentity = Readonly<{ directory: string; selected: string; nonce: string }>
type SourceLaunchLogged = Readonly<{
  kind: 'fork-logged' | 'spawn-logged'
  script: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  execPath: string
  execArgv: []
  detached: true
  stdoutPath: string
  stderrPath: string
}>
type SourceLaunchIgnored = Readonly<{
  kind: 'spawn-ignored'
  execPath: string
  argv: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  detached: true
  stdio: 'ignore'
}>
export type SourceLaunchSpecification = SourceLaunchLogged | SourceLaunchIgnored
export type SourceLaunchExitRecord = Readonly<{
  kind: 'KNOWN_EXIT0'
  role: SourceLaunchRole
  child: ChildProcess
  code: 0
  signal: null
}>
export type SourceLaunchRetainedRecord = Readonly<{
  kind: 'VALIDATED_RETAINED_TERMINAL'
  role: 'owner'
  child: ChildProcess
  terminal: 'SOURCE_RETENTION_CALLBACK_COMMITTED' | 'SOURCE_IPC_FAULT_OBSERVATION_VALIDATED'
  finalReconciled: true
}>
export type SourceLaunchActualRecords = {
  setup: SourceLaunchExitRecord | undefined
  owner: SourceLaunchExitRecord | SourceLaunchRetainedRecord | undefined
  inspector: SourceLaunchExitRecord | undefined
  supervisor: SourceLaunchExitRecord | undefined
}
type SourceLaunchDiagnostic = Readonly<{ filled: boolean; error: unknown }>
type SourceLaunchParentFDState = 'NOT_OPENED' | 'OPEN' | 'ATTEMPTED' | 'CLOSED' | 'UNKNOWN_AFTER_CLOSE_THROW'
type SourceLaunchIntervalState =
  | 'NOT_CREATED'
  | 'REFERENCED'
  | 'CLEAR_ATTEMPTED'
  | 'EMPTY_FAILURE_RELEASED'
  | 'UNKNOWN_AFTER_CLEAR_THROW'
  | 'SUCCESS_RELEASED'
type SourceLaunchSlot = Readonly<{
  status: 'UNUSED' | 'RESERVED' | 'LAUNCHED'
  specification: SourceLaunchSpecification | undefined
  operation: SourceLaunchStage | undefined
  stdoutFD: number | undefined
  stderrFD: number | undefined
  stdoutClose: SourceLaunchParentFDState
  stderrClose: SourceLaunchParentFDState
  child: ChildProcess | undefined
  launched: boolean
  onError: ((error: unknown) => void) | undefined
}>
export type SourceLaunchCustody = Readonly<{
  identity: SourceLaunchIdentity
  slots: Readonly<Record<SourceLaunchRole, SourceLaunchSlot>>
  failed: boolean
  firstError: unknown
  firstRole: SourceLaunchRole | undefined
  firstStage: SourceLaunchStage | undefined
  currentRole: SourceLaunchRole | undefined
  interval: NodeJS.Timeout | undefined
  intervalState: SourceLaunchIntervalState
  completed: boolean
  failurePublicationAttempted: boolean
  diagnostics: Readonly<
    Record<'stdoutClose' | 'stderrClose' | 'failureFile' | 'failureReporter', SourceLaunchDiagnostic>
  >
  complete(actualLifecycleRecords: Readonly<SourceLaunchActualRecords>): void
}>
export type SourceLaunchBoundary = Readonly<{ custody: SourceLaunchCustody; records: SourceLaunchActualRecords }>
export function createSourceLaunchCustody(identity: SourceLaunchIdentity): SourceLaunchCustody
export function launchSourceChild(
  custody: SourceLaunchCustody,
  role: SourceLaunchRole,
  specification: SourceLaunchSpecification,
): ChildProcess
export function assertSourceLaunchActive(custody: SourceLaunchCustody): void
export function failSourceLaunch(
  custody: SourceLaunchCustody,
  role: SourceLaunchRole,
  stage: SourceLaunchStage,
  error: unknown,
): void
export function publishSourceLaunchFailure(custody: SourceLaunchCustody, directory: string): void
