export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { startCollaborationScheduler } = await import('./services/repository-collaboration/scheduler-runtime')
  startCollaborationScheduler()
}
