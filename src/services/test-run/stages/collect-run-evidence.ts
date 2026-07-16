import type { SpawnedProcess } from '@/lib/process/task-spawner'
import type { LogEntry } from '@/lib/test-run/log-formatter'
import type { TestRunTerminalOutcome } from '@/lib/test-run/terminal-state'

type EvidenceLogger = Pick<Console, 'info' | 'error'>

function appendOutput(
  entries: LogEntry[],
  values: string[],
  type: 'stdout' | 'stderr',
  startTime: Date,
  logger: EvidenceLogger,
) {
  const offset = entries.length
  values
    .join('')
    .split('\n')
    .filter(line => line.trim() !== '')
    .forEach((message, index) => {
      entries.push({ type, message, timestamp: new Date(startTime.getTime() + (offset + index) * 10) })
      logger[type === 'stdout' ? 'info' : 'error'](message)
    })
}

export function collectRunOutput(
  process: SpawnedProcess,
  exitCode: number,
  logger: EvidenceLogger,
): { logEntries: LogEntry[]; exitCode: number } {
  const logEntries: LogEntry[] = []
  appendOutput(logEntries, process.output.stdout, 'stdout', process.startTime, logger)
  appendOutput(logEntries, process.output.stderr, 'stderr', process.startTime, logger)
  const exitMessage = `Process exited with code ${exitCode}`
  logEntries.push({ type: 'status', message: exitMessage, timestamp: process.endTime ?? new Date() })
  logger.info(exitMessage)
  return { logEntries, exitCode }
}

export function resolveCollectedRunOutcome(input: {
  cancelled: boolean
  exitCode: number
  evidenceHealth: string
}): TestRunTerminalOutcome {
  if (input.cancelled) return 'cancelled'
  return input.exitCode === 0 && input.evidenceHealth === 'valid' ? 'passed' : 'failed'
}
