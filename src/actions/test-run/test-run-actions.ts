"use server";

import prisma from "@/config/db-config";
import { ActionResponse } from "@/types/form/actionHandler";
import {
  TestCaseStatus,
  TestCaseResult,
  TestRun,
  TestRunStatus,
  TestRunTestCase,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

export interface TestRunsWithRelations extends TestRun {
  testSuite: {
    name: string;
  };
  executor: {
    username: string;
  };
}

export interface TestRunTestCases extends TestRunTestCase {
  testCase: {
    title: string;
  };
}

type TestRunWithTestSuite = {
  id: string;
  name: string;
  testSuiteId: string;
  executor: {
    username: string;
  };
  status: TestRunStatus;
  executionTime: string;
  comments: string | null;
  createdAt: Date;
  updatedAt: Date;
  testSuite: {
    name: string;
  };
};

type TestRunTestCaseWithTestCaseDetails = {
  testRunId: string;
  testCaseId: string;
  status: TestRunStatus;
  result: TestCaseStatus;
  executionTime: string | null;
  comments: string | null;
  testCase: {
    title: string;
    description: string;
    steps: string[];
    creator: {
      username: string;
    };
  };
};

export type TestRunWithRelations = {
  testRun: TestRunWithTestSuite;
  testRunTestCases: TestRunTestCaseWithTestCaseDetails[];
};

export async function getTestRunsAction(): Promise<ActionResponse> {
  try {
    const testRuns = await prisma.testRun.findMany({
      include: {
        testSuite: {
          select: {
            name: true,
          },
        },
        executor: {
          select: {
            username: true,
          },
        },
      },
    });
    return {
      status: 200,
      data: testRuns as TestRunsWithRelations[],
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}

export async function deleteTestRunAction(
  id: string[]
): Promise<ActionResponse> {
  try {
    await prisma.testRun.deleteMany({
      where: {
        id: {
          in: id,
        },
      },
    });
    return {
      status: 200,
      message: "Test runs deleted successfully",
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}

export async function getTestRunAction(id: string): Promise<ActionResponse> {
  try {
    const testRun = await prisma.testRun.findUnique({
      where: {
        id,
      },
      include: {
        executor: {
          select: {
            username: true,
          },
        },
        testSuite: {
          select: {
            name: true,
          },
        },
      },
    });

    const testRunTestCases = await prisma.testRunTestCase.findMany({
      where: {
        testRunId: id,
      },
      include: {
        testCase: {
          select: {
            title: true,
            description: true,
            steps: true,
            creator: {
              select: {
                username: true,
              },
            },
          },
        },
      },
    });

    return {
      status: 200,
      data: {
        testRun,
        testRunTestCases,
      },
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}

export async function getTestRunTestCasesAction(
  testRunId: string
): Promise<ActionResponse> {
  const testRunTestCases = await prisma.testRunTestCase.findMany({
    where: {
      testRunId,
    },
    include: {
      testCase: {
        select: {
          title: true,
        },
      },
    },
  });
  return {
    status: 200,
    data: testRunTestCases as TestRunTestCases[],
  };
}

export async function updateTestRunTestCaseAction(
  testRunId: string,
  testCaseId: string,
  data: {
    status?: TestCaseStatus;
    result?: TestCaseResult;
    executionTime?: number;
    comments?: string;
  }
): Promise<ActionResponse> {
  try {
    const dataToUpdate: {
      status?: TestCaseStatus;
      result?: TestCaseResult;
      executionTime?: number;
      comments?: string;
    } = {};

    if (data.status) {
      dataToUpdate.status = data.status;
    }
    if (data.result) {
      dataToUpdate.result = data.result;
    }
    if (data.executionTime) {
      dataToUpdate.executionTime = data.executionTime;
    }
    if (data.comments) {
      dataToUpdate.comments = data.comments;
    }

    if (
      data.status === undefined &&
      data.result === undefined &&
      data.executionTime === undefined &&
      data.comments === undefined
    ) {
      return {
        status: 400,
        error: "No data to update",
      };
    }

    const updatedTestRunTestCase = await prisma.testRunTestCase.update({
      where: { testRunId_testCaseId: { testRunId, testCaseId } },
      data: dataToUpdate,
    });

    revalidatePath("/test-runs");

    return {
      status: 200,
      data: updatedTestRunTestCase,
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}
