import { describe, expect, it } from 'vitest'
import {
  createSubmissionPayloadCapture,
  recordSubmissionPayloadIdentity,
} from './quality-journey-submission-payload-observation'
const digest = (letter: string) => `sha256:${letter.repeat(64)}`
const identity = () => ({
  journeyId: 'journey',
  targetProjectId: 'target',
  workItemId: 'work',
  attemptId: 'attempt',
  assignmentId: 'assignment',
  assignmentGeneration: 1,
  leaseId: 'lease',
  role: 'REQUIREMENT_ANALYZER',
  principal: { principalId: 'project:synthetic', assurance: 'PROJECT_CREDENTIAL_ONLY' },
  operation: 'ANALYSIS_SUBMIT',
  idempotencyKey: 'original',
  coordinatorSessionId: 'session',
  coordinatorGeneration: 1,
  coordinatorPrincipalId: 'project:synthetic',
})
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(yes => {
    resolve = yes
  })
  return { promise, resolve }
}
describe('original canonical submission payload observation', () => {
  it('does nothing outside a capture and never claims an observed hash is a commit', async () => {
    recordSubmissionPayloadIdentity(identity(), digest('a'))
    const capture = createSubmissionPayloadCapture(identity())
    expect(capture.payloadHash()).toBeNull()
    await capture.run(async () => {
      recordSubmissionPayloadIdentity(identity(), digest('a'))
    })
    expect(capture.payloadHash()).toBe(digest('a'))
    expect(Object.keys(capture).sort()).toEqual(['payloadHash', 'run'])
    expect(JSON.stringify(capture)).toBe('{}')
  })
  it.each([
    'journeyId',
    'targetProjectId',
    'workItemId',
    'attemptId',
    'assignmentId',
    'leaseId',
    'role',
    'operation',
    'idempotencyKey',
    'coordinatorSessionId',
    'coordinatorPrincipalId',
  ] as const)('refuses unmatched %s without retaining another request', async field => {
    const capture = createSubmissionPayloadCapture(identity())
    await capture.run(async () => {
      recordSubmissionPayloadIdentity({ ...identity(), [field]: 'other' }, digest('b'))
    })
    expect(capture.payloadHash()).toBeNull()
  })
  it.each(['assignmentGeneration', 'coordinatorGeneration'] as const)('refuses unmatched %s', async field => {
    const capture = createSubmissionPayloadCapture(identity())
    await capture.run(async () => {
      recordSubmissionPayloadIdentity({ ...identity(), [field]: 2 }, digest('b'))
    })
    expect(capture.payloadHash()).toBeNull()
  })
  it.each(['principalId', 'assurance'] as const)('refuses unmatched principal %s', async field => {
    const capture = createSubmissionPayloadCapture(identity())
    await capture.run(async () => {
      const actual = identity()
      actual.principal[field] = 'other'
      recordSubmissionPayloadIdentity(actual, digest('b'))
    })
    expect(capture.payloadHash()).toBeNull()
  })
  it('copies the expected identity and never exposes secret or payload data', async () => {
    const expected = {
      ...identity(),
      assignmentSecret: 'synthetic-secret-that-must-not-be-retained',
      payload: { prose: 'synthetic private content' },
    }
    const capture = createSubmissionPayloadCapture(expected)
    expected.journeyId = 'changed'
    await capture.run(async () => {
      recordSubmissionPayloadIdentity(identity(), digest('a'))
    })
    expect(capture.payloadHash()).toBe(digest('a'))
    expect(JSON.stringify(capture)).not.toContain('synthetic')
  })
  it('permits exact repeated observation but permanently poisons conflicting matching hashes', async () => {
    const capture = createSubmissionPayloadCapture(identity())
    await capture.run(async () => {
      recordSubmissionPayloadIdentity(identity(), digest('a'))
      recordSubmissionPayloadIdentity(identity(), digest('a'))
    })
    expect(capture.payloadHash()).toBe(digest('a'))
    await capture.run(async () => {
      recordSubmissionPayloadIdentity(identity(), digest('b'))
      recordSubmissionPayloadIdentity(identity(), digest('a'))
    })
    expect(capture.payloadHash()).toBeNull()
  })
  it('preserves the first observed hash after an original operation rejects', async () => {
    const capture = createSubmissionPayloadCapture(identity())
    await expect(
      capture.run(async () => {
        recordSubmissionPayloadIdentity(identity(), digest('a'))
        throw new Error('synthetic lost commit reply')
      }),
    ).rejects.toThrow('synthetic lost commit reply')
    expect(capture.payloadHash()).toBe(digest('a'))
  })
  it('isolates nested capture contexts with identical scope', async () => {
    const outer = createSubmissionPayloadCapture(identity()),
      inner = createSubmissionPayloadCapture(identity())
    await outer.run(async () => {
      recordSubmissionPayloadIdentity(identity(), digest('a'))
      await inner.run(async () => {
        await Promise.resolve()
        recordSubmissionPayloadIdentity(identity(), digest('b'))
      })
      recordSubmissionPayloadIdentity(identity(), digest('a'))
    })
    expect(outer.payloadHash()).toBe(digest('a'))
    expect(inner.payloadHash()).toBe(digest('b'))
  })
  it('isolates concurrent original operations with identical scope', async () => {
    const a = createSubmissionPayloadCapture(identity()),
      b = createSubmissionPayloadCapture(identity()),
      gate = deferred()
    await Promise.all([
      a.run(async () => {
        await gate.promise
        recordSubmissionPayloadIdentity(identity(), digest('a'))
      }),
      b.run(async () => {
        recordSubmissionPayloadIdentity(identity(), digest('b'))
        gate.resolve()
        await Promise.resolve()
        recordSubmissionPayloadIdentity(identity(), digest('b'))
      }),
    ])
    expect(a.payloadHash()).toBe(digest('a'))
    expect(b.payloadHash()).toBe(digest('b'))
  })
  it('treats invalid matching observations as uncertain without changing caller errors', async () => {
    const capture = createSubmissionPayloadCapture(identity())
    await capture.run(async () => {
      expect(() => recordSubmissionPayloadIdentity(identity(), 'not-a-digest')).not.toThrow()
      recordSubmissionPayloadIdentity(identity(), digest('a'))
    })
    expect(capture.payloadHash()).toBeNull()
  })
})
