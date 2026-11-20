export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { startCollaborationScheduler } = await import('./services/repository-collaboration/scheduler-runtime')
  startCollaborationScheduler()
  const { registerAppManagedJourneyRuntimeWake } =
    await import('./services/coordinator/app-managed-progression-service')
  registerAppManagedJourneyRuntimeWake()
}
