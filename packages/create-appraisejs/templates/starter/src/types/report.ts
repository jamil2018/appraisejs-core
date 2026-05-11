import type { Prisma } from '@prisma/client'

export type ReportWithRelations = Prisma.ReportGetPayload<{
  include: {
    testRun: {
      include: {
        environment: true
        tags: true
      }
    }
    testCases: {
      include: {
        testRunTestCase: {
          include: {
            testCase: {
              include: {
                tags: true
              }
            }
            testSuite: true
          }
        }
        reportScenario: {
          include: {
            reportFeature: true
          }
        }
      }
    }
  }
}>

export type ReportDetailWithRelations = Prisma.ReportGetPayload<{
  include: {
    testRun: {
      include: {
        environment: true
        tags: true
      }
    }
    features: {
      include: {
        tags: true
        scenarios: {
          include: {
            tags: true
            steps: {
              orderBy: {
                order: 'asc'
              }
            }
            hooks: true
          }
        }
      }
    }
    testCases: {
      include: {
        testRunTestCase: {
          include: {
            testCase: {
              include: {
                tags: true
              }
            }
            testSuite: true
          }
        }
        reportScenario: {
          include: {
            reportFeature: true
            tags: true
            steps: {
              orderBy: {
                order: 'asc'
              }
            }
            hooks: true
          }
        }
      }
    }
  }
}>
