import { requireActiveProject } from '@/lib/active-project'
import { exportQualityJourney } from '@/services/coordinator/quality-journey-artifact-library-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ journeyId: string }> }) {
  const [{ journeyId }, url] = await Promise.all([params, Promise.resolve(new URL(request.url))])
  const project = await requireActiveProject(url.searchParams.get('project'))
  const exportValue = await exportQualityJourney({ journeyId, targetProjectId: project.id })
  return new Response(JSON.stringify(exportValue, null, 2), {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Disposition': `attachment; filename="quality-journey-${journeyId}.json"`,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}
