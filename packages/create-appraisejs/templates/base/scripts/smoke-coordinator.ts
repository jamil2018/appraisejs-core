import { ensureProjectIdentity } from '@/services/coordinator/coordinator-service'

const baseUrl = process.env.APPRAISE_BASE_URL ?? 'http://127.0.0.1:3000'
const identity = await ensureProjectIdentity()
const planId = `coordinator-smoke-${Date.now()}`
const headers = {
  authorization: `Bearer ${identity.token}`,
  'content-type': 'application/json',
  'x-appraise-project': identity.projectFingerprint,
}

const createResponse = await fetch(`${baseUrl}/api/internal/coordinator/plans`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    plan: {
      version: '1',
      planId,
      revision: 1,
      lifecycle: 'awaiting_plan_review',
      goal: 'Verify coordinator API and MCP prerequisites',
      description: 'Smoke test coordinator API and MCP prerequisites against a live local application.',
      tasks: [
        {
          id: 'verify-event',
          title: 'Receive review-ready event',
          description: 'Create a plan and receive its durable review-ready event.',
          acceptanceCriteria: ['The plan_review_ready event is delivered.'],
          validationIntent: 'Run this local smoke test.',
        },
      ],
      edges: [],
      implementationGroups: [],
    },
  }),
})
if (!createResponse.ok) throw new Error(`Plan creation failed: ${await createResponse.text()}`)

const eventResponse = await fetch(`${baseUrl}/api/internal/coordinator/plans/${planId}/events?after=0&wait=true`, {
  headers,
})
if (!eventResponse.ok) throw new Error(`Event read failed: ${await eventResponse.text()}`)
const result = (await eventResponse.json()) as { events?: Array<{ type: string }> }
if (!result.events?.some(event => event.type === 'plan_review_ready')) {
  throw new Error('plan_review_ready was not delivered.')
}
console.error(`Coordinator smoke test passed for ${planId}.`)
