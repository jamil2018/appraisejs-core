import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createHash } from 'node:crypto'

import { CredentialExecutionAuthorizationIssuer, PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import {
  consumeCredentialExecutionGrant,
  ensureCredentialExecutionRequest,
  issueLocalUiGrant,
  setCredentialAuthorizationClientForTests,
} from './credential-execution-authorization-service'

const digest = (value: string) => `sha256:${value.padEnd(64, 'a').slice(0, 64)}`
const valueHash = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`

let workspace: string
let prisma: PrismaClient

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-credential-authorization-'))
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  setCredentialAuthorizationClientForTests(prisma as never)
})

afterEach(async () => {
  await prisma?.$disconnect()
  setCredentialAuthorizationClientForTests()
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('credential authorization grant persistence', () => {
  it('consumes a grant once with SQLite CAS and rejects the exact replay', async () => {
    const target = await prisma.targetProject.create({
      data: {
        id: 'target-real',
        kind: 'LOCAL_WORKSPACE',
        canonicalIdentity: `path:${workspace}`,
        canonicalPath: workspace,
        normalizedRemoteOrigin: null,
        displayName: 'Real SQLite target',
        fingerprint: digest('target'),
      },
    })
    const plan = await prisma.qualityPlan.create({
      data: { id: 'plan-real', targetProjectId: target.id, title: 'Plan' },
    })
    const revision = await prisma.qualityPlanRevision.create({
      data: {
        id: 'revision-real',
        targetProjectId: target.id,
        qualityPlanId: plan.id,
        revision: 1,
        contentHash: digest('revision'),
        sourceSpecification: 'specification',
        requirementGraphJson: '{}',
      },
    })
    const subject = await prisma.evaluationSubjectRevision.create({
      data: { id: 'subject-real', subjectDigest: digest('subject'), subjectKind: 'ARTIFACT', authority: 'test' },
    })
    const assessment = await prisma.assessment.create({
      data: {
        id: 'assessment-real',
        targetProjectId: target.id,
        qualityPlanId: plan.id,
        qualityPlanRevisionId: revision.id,
        evaluationSubjectRevisionId: subject.id,
        lineageId: 'assessment-real',
      },
    })
    const environment = await prisma.environment.create({
      data: {
        id: 'environment-real',
        targetProjectId: target.id,
        name: 'credential environment',
        baseUrl: 'https://example.test',
        passwordEnvironmentVariable: 'APPRAISE_TEST_PASSWORD',
        credentialState: 'REFERENCE_CONFIGURED',
      },
    })
    const request = await prisma.assessmentExecutionRequest.create({
      data: {
        id: 'request-real',
        targetProjectId: target.id,
        assessmentId: assessment.id,
        qualityPlanId: plan.id,
        qualityPlanRevisionId: revision.id,
        evaluationSubjectRevisionId: subject.id,
        subjectDigest: subject.subjectDigest,
        environmentId: environment.id,
        publicationFingerprint: digest('publication'),
        runtimeInputHash: digest('runtime'),
        bindingsHash: digest('bindings'),
        requestHash: digest('request'),
        canonicalRequestJson: '{}',
        expiresAt: new Date(Date.now() + 60_000),
        bindings: { create: { slot: 'case:step:password', reference: 'environment:password' } },
      },
    })
    const session = await prisma.credentialAuthorizationUiSession.create({
      data: {
        id: 'session-real',
        sessionTokenHash: digest('session'),
        csrfTokenHash: digest('csrf'),
        targetProjectId: target.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
    const grant = await prisma.assessmentExecutionAuthorizationGrant.create({
      data: {
        id: 'grant-real',
        requestId: request.id,
        issuerKind: CredentialExecutionAuthorizationIssuer.LOCAL_UI_SESSION,
        localUiSessionId: session.id,
        notBefore: new Date(Date.now() - 1_000),
        expiresAt: new Date(Date.now() + 60_000),
      },
    })

    await prisma.$transaction(tx =>
      consumeCredentialExecutionGrant(tx, {
        grantId: grant.id,
        requestId: request.id,
        requestHash: request.requestHash,
      }),
    )
    await expect(
      prisma.$transaction(tx =>
        consumeCredentialExecutionGrant(tx, {
          grantId: grant.id,
          requestId: request.id,
          requestHash: request.requestHash,
        }),
      ),
    ).rejects.toThrow('AUTHORIZATION_ALREADY_CONSUMED')
  })

  it('commits stale-local retirement before returning expiry and then creates a fresh exact request', async () => {
    const target = await prisma.targetProject.create({
      data: {
        id: 'target-fresh',
        kind: 'LOCAL_WORKSPACE',
        canonicalIdentity: `path:${workspace}`,
        canonicalPath: workspace,
        normalizedRemoteOrigin: null,
        displayName: 'Target',
        fingerprint: digest('target-fresh'),
      },
    })
    const plan = await prisma.qualityPlan.create({
      data: { id: 'plan-fresh', targetProjectId: target.id, title: 'Plan' },
    })
    const revision = await prisma.qualityPlanRevision.create({
      data: {
        id: 'revision-fresh',
        targetProjectId: target.id,
        qualityPlanId: plan.id,
        revision: 1,
        contentHash: digest('revision-fresh'),
        sourceSpecification: 'spec',
        requirementGraphJson: '{}',
      },
    })
    const subject = await prisma.evaluationSubjectRevision.create({
      data: { id: 'subject-fresh', subjectDigest: digest('subject-fresh'), subjectKind: 'ARTIFACT', authority: 'test' },
    })
    const assessment = await prisma.assessment.create({
      data: {
        id: 'assessment-fresh',
        targetProjectId: target.id,
        qualityPlanId: plan.id,
        qualityPlanRevisionId: revision.id,
        evaluationSubjectRevisionId: subject.id,
        lineageId: 'assessment-fresh',
      },
    })
    const environment = await prisma.environment.create({
      data: {
        id: 'environment-fresh',
        targetProjectId: target.id,
        name: 'env',
        baseUrl: 'https://example.test',
        passwordEnvironmentVariable: 'APPRAISE_TEST_PASSWORD',
        credentialState: 'REFERENCE_CONFIGURED',
      },
    })
    const scope = {
      targetProjectId: target.id,
      assessmentId: assessment.id,
      qualityPlanId: plan.id,
      qualityPlanRevisionId: revision.id,
      evaluationSubjectRevisionId: subject.id,
      subjectDigest: subject.subjectDigest,
      environmentId: environment.id,
      publicationFingerprint: digest('publication-fresh'),
      runtimeInputHash: digest('runtime-fresh'),
      bindings: [{ slot: 'case:step:password', reference: 'environment:password' }],
      requestHash: digest('execution-fresh'),
    }
    const first = await ensureCredentialExecutionRequest(scope)
    const sessionToken = 'session-fresh'
    const csrfToken = 'csrf-fresh'
    const session = await prisma.credentialAuthorizationUiSession.create({
      data: {
        id: 'session-fresh',
        sessionTokenHash: valueHash(sessionToken),
        csrfTokenHash: valueHash(csrfToken),
        targetProjectId: target.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
    await prisma.assessmentExecutionAuthorizationGrant.create({
      data: {
        id: 'grant-fresh',
        requestId: first.id,
        issuerKind: CredentialExecutionAuthorizationIssuer.LOCAL_UI_SESSION,
        localUiSessionId: session.id,
        notBefore: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() - 1_000),
      },
    })
    await expect(
      issueLocalUiGrant({
        requestId: first.id,
        assessmentId: assessment.id,
        targetProjectId: target.id,
        sessionToken,
        csrfToken,
      }),
    ).rejects.toThrow('AUTHORIZATION_EXPIRED')
    await expect(
      prisma.assessmentExecutionRequest.findUniqueOrThrow({ where: { id: first.id } }),
    ).resolves.toMatchObject({ activeScopeKey: null })
    const fresh = await ensureCredentialExecutionRequest(scope)
    expect(fresh.id).not.toBe(first.id)
  })
})
