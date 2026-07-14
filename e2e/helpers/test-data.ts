import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  BrowserEngine,
  StepKeyword,
  StepParameterType,
  StepStatus,
  TagType,
  TemplateStepGroupType,
  TemplateStepIcon,
  TemplateStepType,
  TestRunResult,
  TestRunStatus,
  TestRunTestCaseResult,
  TestRunTestCaseStatus,
} from '@prisma/client'

import prisma from '../../src/config/db-config'
import { generateFeatureFile } from '../../src/lib/feature-file-generator'

export const seededIds = {
  targetProject: '00000000-0000-4000-8000-000000000001',
  module: 'e2e-module',
  environment: 'e2e-environment',
  tag: 'e2e-tag',
  locatorGroup: 'e2e-locator-group',
  locator: 'e2e-locator',
  templateStepGroup: 'e2e-template-step-group',
  templateStep: 'e2e-template-step',
  testCase: 'e2e-test-case',
  testCaseStep: 'e2e-test-case-step',
  testSuite: 'e2e-test-suite',
  testRun: 'e2e-test-run',
  testRunRunId: 'e2e-run-id',
  testRunTestCase: 'e2e-test-run-test-case',
  testRunLog: 'e2e-test-run-log',
  report: 'e2e-report',
  reportFeature: 'e2e-report-feature',
  reportScenario: 'e2e-report-scenario',
  reportStep: 'e2e-report-step',
  reportTestCase: 'e2e-report-test-case',
  templateTestCase: 'e2e-template-test-case',
  templateTestCaseStep: 'e2e-template-test-case-step',
  secondModule: 'e2e-second-module',
  secondTestSuite: 'e2e-second-suite',
  secondTestCase: 'e2e-second-case',
  failedTestRun: 'e2e-failed-run',
  failedTestRunRunId: 'e2e-failed-run-id',
  pendingTestRun: 'e2e-pending-run',
  pendingTestRunRunId: 'e2e-pending-run-id',
  runningTestRun: 'e2e-running-run',
  runningTestRunRunId: 'e2e-running-run-id',
}

const generatedFeaturePath = join(process.cwd(), 'automation', 'features', 'E2E Auth', 'e2e-auth-suite.feature')
const generatedCrudSuiteFeaturePath = join(process.cwd(), 'automation', 'features', 'E2E Auth', 'e2e-ui-suite.feature')
const generatedCrudSuiteMetadataPath = join(
  process.cwd(),
  'automation',
  'features',
  'E2E Auth',
  'e2e-ui-suite.appraise.json',
)

export async function resetE2eData(): Promise<void> {
  await prisma.$transaction([
    prisma.reportStep.deleteMany(),
    prisma.reportHook.deleteMany(),
    prisma.reportScenarioTag.deleteMany(),
    prisma.reportTestCase.deleteMany(),
    prisma.reportScenario.deleteMany(),
    prisma.reportFeatureTag.deleteMany(),
    prisma.reportFeature.deleteMany(),
    prisma.report.deleteMany(),
    prisma.testRunLog.deleteMany(),
    prisma.testRunTestCase.deleteMany(),
    prisma.testRun.deleteMany(),
    prisma.testCaseFlowBlockNode.deleteMany(),
    prisma.testCaseFlowBlock.deleteMany(),
    prisma.testCaseStepParameter.deleteMany(),
    prisma.testCaseStep.deleteMany(),
    prisma.testCase.deleteMany(),
    prisma.templateTestCaseFlowBlockNode.deleteMany(),
    prisma.templateTestCaseFlowBlock.deleteMany(),
    prisma.templateTestCaseStepParameter.deleteMany(),
    prisma.templateTestCaseStep.deleteMany(),
    prisma.templateTestCase.deleteMany(),
    prisma.templateStepParameter.deleteMany(),
    prisma.templateStep.deleteMany(),
    prisma.templateStepGroup.deleteMany(),
    prisma.conflictResolution.deleteMany(),
    prisma.locator.deleteMany(),
    prisma.locatorGroup.deleteMany(),
    prisma.testSuite.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.environment.deleteMany(),
    prisma.module.deleteMany(),
    prisma.testCaseMetrics.deleteMany(),
    prisma.testSuiteMetrics.deleteMany(),
    prisma.dashboardMetrics.deleteMany(),
  ])

  rmSync(generatedFeaturePath, { force: true })
  rmSync(generatedCrudSuiteFeaturePath, { force: true })
  rmSync(generatedCrudSuiteMetadataPath, { force: true })
}

export async function seedCoreData(): Promise<void> {
  const now = new Date('2026-01-01T00:00:00.000Z')
  const completedAt = new Date('2026-01-01T00:00:04.000Z')

  await prisma.module.create({
    data: {
      id: seededIds.module,
      name: 'E2E Auth',
    },
  })

  await prisma.environment.create({
    data: {
      id: seededIds.environment,
      name: 'E2E Local',
      baseUrl: 'http://127.0.0.1:3200',
      apiBaseUrl: 'http://127.0.0.1:3200/api',
      username: 'tester',
      password: 'secret',
    },
  })

  await prisma.tag.create({
    data: {
      id: seededIds.tag,
      name: 'E2E Smoke',
      tagExpression: '@e2e-smoke',
      type: TagType.FILTER,
    },
  })

  await prisma.locatorGroup.create({
    data: {
      id: seededIds.locatorGroup,
      name: 'E2E Login Page',
      route: '/login',
      moduleId: seededIds.module,
    },
  })

  await prisma.locator.create({
    data: {
      id: seededIds.locator,
      name: 'E2E Sign In Button',
      value: 'text=Sign in',
      locatorGroupId: seededIds.locatorGroup,
    },
  })

  await prisma.templateStepGroup.create({
    data: {
      id: seededIds.templateStepGroup,
      name: 'E2E Browser Actions',
      description: 'Seeded template steps for E2E coverage',
      type: TemplateStepGroupType.ACTION,
    },
  })

  await prisma.templateStep.create({
    data: {
      id: seededIds.templateStep,
      name: 'Open seeded page',
      description: 'Navigates to a seeded page',
      signature: 'Given I open the seeded page',
      functionDefinition: 'async function openSeededPage() {}',
      type: TemplateStepType.ACTION,
      icon: TemplateStepIcon.NAVIGATION,
      templateStepGroupId: seededIds.templateStepGroup,
      parameters: {
        create: [
          {
            name: 'url',
            order: 0,
            type: StepParameterType.STRING,
          },
        ],
      },
    },
  })

  await prisma.testCase.create({
    data: {
      id: seededIds.testCase,
      title: 'E2E seeded login works',
      description: 'Seeded login smoke case',
      tags: {
        connect: [{ id: seededIds.tag }],
      },
      steps: {
        create: [
          {
            id: seededIds.testCaseStep,
            order: 0,
            gherkinStep: 'Given I open the seeded page',
            icon: TemplateStepIcon.NAVIGATION,
            label: 'Open seeded page',
            templateStepId: seededIds.templateStep,
            parameters: {
              create: [
                {
                  name: 'url',
                  value: '/',
                  order: 0,
                  type: StepParameterType.STRING,
                },
              ],
            },
          },
        ],
      },
    },
  })

  await prisma.testSuite.create({
    data: {
      id: seededIds.testSuite,
      name: 'E2E Auth Suite',
      description: 'Seeded suite for E2E feature generation',
      moduleId: seededIds.module,
      tags: {
        connect: [{ id: seededIds.tag }],
      },
      testCases: {
        connect: [{ id: seededIds.testCase }],
      },
    },
  })

  await prisma.testRun.create({
    data: {
      id: seededIds.testRun,
      runId: seededIds.testRunRunId,
      name: 'E2E Completed Run',
      status: TestRunStatus.COMPLETED,
      result: TestRunResult.PASSED,
      startedAt: now,
      completedAt,
      environmentId: seededIds.environment,
      browserEngine: BrowserEngine.CHROMIUM,
      testWorkersCount: 1,
      tags: {
        connect: [{ id: seededIds.tag }],
      },
      testCases: {
        create: [
          {
            id: seededIds.testRunTestCase,
            testCaseId: seededIds.testCase,
            testSuiteId: seededIds.testSuite,
            status: TestRunTestCaseStatus.COMPLETED,
            result: TestRunTestCaseResult.PASSED,
          },
        ],
      },
    },
  })

  await prisma.testRunLog.create({
    data: {
      id: seededIds.testRunLog,
      testRunId: seededIds.testRunRunId,
      logs: JSON.stringify([
        {
          type: 'stdout',
          message: 'E2E seeded run started',
          timestamp: now.toISOString(),
        },
        {
          type: 'status',
          message: 'Process exited with code 0',
          timestamp: completedAt.toISOString(),
        },
      ]),
    },
  })

  await prisma.report.create({
    data: {
      id: seededIds.report,
      name: 'E2E Report',
      description: 'Seeded report for E2E smoke coverage',
      testRunId: seededIds.testRun,
      features: {
        create: [
          {
            id: seededIds.reportFeature,
            name: 'E2E Auth Suite',
            description: 'Seeded suite for E2E feature generation',
            uri: 'automation/features/e2e-auth/e2e-auth-suite.feature',
            line: 1,
            keyword: 'Feature',
            scenarios: {
              create: [
                {
                  id: seededIds.reportScenario,
                  name: '[E2E seeded login works] Seeded login smoke case',
                  line: 6,
                  keyword: 'Scenario',
                  type: 'scenario',
                  cucumberId: 'e2e-auth-suite;e2e-seeded-login-works',
                  steps: {
                    create: [
                      {
                        id: seededIds.reportStep,
                        keyword: StepKeyword.GIVEN,
                        line: 7,
                        name: 'I open the seeded page',
                        status: StepStatus.PASSED,
                        duration: '1000000',
                        order: 0,
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  })

  await prisma.reportTestCase.create({
    data: {
      id: seededIds.reportTestCase,
      reportId: seededIds.report,
      testCaseId: seededIds.testCase,
      testRunTestCaseId: seededIds.testRunTestCase,
      reportScenarioId: seededIds.reportScenario,
      duration: '1ms',
    },
  })

  await prisma.dashboardMetrics.create({
    data: {
      failedRecentRunsCount: 0,
      repeatedlyFailingTestsCount: 0,
      flakyTestsCount: 0,
      suitesNotExecutedRecentlyCount: 1,
    },
  })

  await seedTemplateCatalog()
  await seedSecondModuleSuite()
  await seedTestRunVariants()
  await seedDashboardAttentionMetrics()
  await Promise.all([
    prisma.module.updateMany({ data: { targetProjectId: seededIds.targetProject } }),
    prisma.environment.updateMany({ data: { targetProjectId: seededIds.targetProject } }),
    prisma.tag.updateMany({ data: { targetProjectId: seededIds.targetProject } }),
    prisma.locatorGroup.updateMany({ data: { targetProjectId: seededIds.targetProject } }),
    prisma.locator.updateMany({ data: { targetProjectId: seededIds.targetProject } }),
    prisma.templateStepGroup.updateMany({ data: { targetProjectId: seededIds.targetProject } }),
    prisma.testCase.updateMany({ data: { targetProjectId: seededIds.targetProject } }),
    prisma.testSuite.updateMany({ data: { targetProjectId: seededIds.targetProject } }),
    prisma.templateTestCase.updateMany({ data: { targetProjectId: seededIds.targetProject } }),
    prisma.testRun.updateMany({ data: { targetProjectId: seededIds.targetProject } }),
    prisma.report.updateMany({ data: { targetProjectId: seededIds.targetProject } }),
    prisma.testCaseMetrics.updateMany({ data: { targetProjectId: seededIds.targetProject } }),
    prisma.testSuiteMetrics.updateMany({ data: { targetProjectId: seededIds.targetProject } }),
    prisma.dashboardMetrics.updateMany({ data: { targetProjectId: seededIds.targetProject } }),
  ])
}

export async function seedTemplateCatalog(): Promise<void> {
  await prisma.templateTestCase.create({
    data: {
      id: seededIds.templateTestCase,
      name: 'E2E Login Template',
      description: 'Reusable login flow for E2E',
      steps: {
        create: [
          {
            id: seededIds.templateTestCaseStep,
            order: 0,
            gherkinStep: 'Given I open the seeded page',
            icon: TemplateStepIcon.NAVIGATION,
            label: 'Open seeded page',
            templateStepId: seededIds.templateStep,
            parameters: {
              create: [
                {
                  name: 'url',
                  defaultValue: '/',
                  order: 0,
                  type: StepParameterType.STRING,
                },
              ],
            },
          },
        ],
      },
    },
  })
}

export async function seedSecondModuleSuite(): Promise<void> {
  await prisma.module.create({
    data: {
      id: seededIds.secondModule,
      name: 'E2E Secondary',
    },
  })

  await prisma.testCase.create({
    data: {
      id: seededIds.secondTestCase,
      title: 'E2E secondary case',
      description: 'Secondary module assignment case',
    },
  })

  await prisma.testSuite.create({
    data: {
      id: seededIds.secondTestSuite,
      name: 'E2E Secondary Suite',
      description: 'Suite for assignment coverage',
      moduleId: seededIds.secondModule,
      testCases: {
        connect: [{ id: seededIds.secondTestCase }],
      },
    },
  })
}

export async function seedTestRunVariants(): Promise<void> {
  const recentFailedAt = new Date()
  recentFailedAt.setDate(recentFailedAt.getDate() - 1)

  await prisma.testRun.create({
    data: {
      id: seededIds.failedTestRun,
      runId: seededIds.failedTestRunRunId,
      name: 'E2E Failed Run',
      status: TestRunStatus.COMPLETED,
      result: TestRunResult.FAILED,
      startedAt: recentFailedAt,
      completedAt: recentFailedAt,
      environmentId: seededIds.environment,
      browserEngine: BrowserEngine.CHROMIUM,
      testWorkersCount: 1,
      testCases: {
        create: [
          {
            testCaseId: seededIds.testCase,
            testSuiteId: seededIds.testSuite,
            status: TestRunTestCaseStatus.COMPLETED,
            result: TestRunTestCaseResult.FAILED,
          },
        ],
      },
    },
  })

  await prisma.testRun.create({
    data: {
      id: seededIds.pendingTestRun,
      runId: seededIds.pendingTestRunRunId,
      name: 'E2E Queued Run',
      status: TestRunStatus.QUEUED,
      result: TestRunResult.PENDING,
      environmentId: seededIds.environment,
      browserEngine: BrowserEngine.CHROMIUM,
      testWorkersCount: 1,
    },
  })

  await prisma.testRun.create({
    data: {
      id: seededIds.runningTestRun,
      runId: seededIds.runningTestRunRunId,
      name: 'E2E Running Run',
      status: TestRunStatus.RUNNING,
      result: TestRunResult.PENDING,
      startedAt: new Date(),
      environmentId: seededIds.environment,
      browserEngine: BrowserEngine.CHROMIUM,
      testWorkersCount: 1,
      testCases: {
        create: [
          {
            testCaseId: seededIds.testCase,
            testSuiteId: seededIds.testSuite,
            status: TestRunTestCaseStatus.RUNNING,
            result: TestRunTestCaseResult.UNTESTED,
          },
        ],
      },
    },
  })
}

export async function seedDashboardAttentionMetrics(): Promise<void> {
  await prisma.testCaseMetrics.upsert({
    where: { testCaseId: seededIds.testCase },
    create: {
      testCaseId: seededIds.testCase,
      isRepeatedlyFailing: true,
      isFlaky: true,
      failureRate: 0.5,
      totalRecentRuns: 4,
      failedRecentRuns: 2,
      lastExecutedAt: new Date(),
      lastFailedAt: new Date(),
    },
    update: {
      isRepeatedlyFailing: true,
      isFlaky: true,
      failureRate: 0.5,
      totalRecentRuns: 4,
      failedRecentRuns: 2,
      lastExecutedAt: new Date(),
      lastFailedAt: new Date(),
    },
  })

  await prisma.testSuiteMetrics.upsert({
    where: { testSuiteId: seededIds.testSuite },
    create: {
      testSuiteId: seededIds.testSuite,
      lastExecutedAt: null,
    },
    update: {
      lastExecutedAt: null,
    },
  })

  await prisma.dashboardMetrics.deleteMany()
  await prisma.dashboardMetrics.create({
    data: {
      failedRecentRunsCount: 1,
      repeatedlyFailingTestsCount: 1,
      flakyTestsCount: 1,
      suitesNotExecutedRecentlyCount: 1,
    },
  })
}

export async function generateSeededFeature(): Promise<string> {
  return generateFeatureFile(seededIds.testSuite, 'E2E Auth Suite', 'Seeded suite for E2E feature generation')
}

export function readGeneratedFeature(): string {
  if (!existsSync(generatedFeaturePath)) {
    return ''
  }

  return readFileSync(generatedFeaturePath, 'utf8')
}

export async function findModuleByName(name: string) {
  return prisma.module.findFirst({ where: { name } })
}

export async function findTestRunById(id: string) {
  return prisma.testRun.findUnique({ where: { id } })
}

export async function findTagByName(name: string) {
  return prisma.tag.findFirst({ where: { name } })
}

export async function findEnvironmentByName(name: string) {
  return prisma.environment.findFirst({ where: { name } })
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect()
}
