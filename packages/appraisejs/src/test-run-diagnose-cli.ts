export type TestRunDiagnosticResponse = Record<string, unknown>

type DiagnoseDependencies = {
  diagnose: (runId: string) => Promise<TestRunDiagnosticResponse>
  write: (value: string) => void
}

export type TestRunDiagnoseResult = {
  exitCode: 0 | 2
  diagnostic: Record<string, unknown>
}

function diagnosticDto(result: TestRunDiagnosticResponse): Record<string, unknown> {
  const value = result.kind === 'capsule' ? result.diagnostic : (result.evidence ?? result)
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function isBlocked(value: Record<string, unknown>): boolean {
  const preflight = value.preflight
  return (
    (preflight !== null &&
      typeof preflight === 'object' &&
      (preflight as Record<string, unknown>).status === 'blocked') ||
    (Array.isArray(value.blockers) && value.blockers.length > 0)
  )
}

function boundedText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 240) : fallback
}

function humanBlocker(value: unknown): string {
  if (!value || typeof value !== 'object') return boundedText(value, 'Blocked')
  const blocker = value as Record<string, unknown>
  const code = boundedText(blocker.code, 'BLOCKED')
  const message = boundedText(blocker.message, '')
  const recovery = boundedText(blocker.recoveryAction, '')
  return [code, message, recovery].filter(Boolean).join(': ')
}

/** Runs the test-run diagnostic presentation independently of Commander and transport setup. */
export async function runTestRunDiagnose(
  options: { runId: string; json: boolean },
  dependencies: DiagnoseDependencies,
): Promise<TestRunDiagnoseResult> {
  const result = await dependencies.diagnose(options.runId)
  const diagnostic = diagnosticDto(result)
  const blocked = isBlocked(diagnostic)

  if (options.json) {
    dependencies.write(JSON.stringify(diagnostic, null, 2))
  } else {
    dependencies.write(`Run ${options.runId}: ${result.kind === 'capsule' ? 'capsule' : 'legacy'}`)
    dependencies.write(`Status: ${blocked ? 'blocked' : 'ready'}`)
    const action = (diagnostic.nextRecoveryAction ?? diagnostic.nextAction) as Record<string, unknown> | undefined
    dependencies.write(`Next: ${boundedText(action?.code ?? action?.tool, 'inspect diagnostic JSON')}`)
    const blockers = Array.isArray(diagnostic.blockers) ? diagnostic.blockers.slice(0, 16) : []
    for (const blocker of blockers) dependencies.write(`- ${humanBlocker(blocker)}`)
  }

  return { exitCode: blocked ? 2 : 0, diagnostic }
}
