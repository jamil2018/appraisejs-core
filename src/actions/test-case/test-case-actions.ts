"use server";

import prisma from "@/config/db-config";
import { ActionResponse } from "@/types/form/actionHandler";
import { revalidatePath } from "next/cache";
import { testCaseSchema } from "@/constants/form-opts/test-case-form-opts";
import { z } from "zod";

import { StepParameterType } from "@prisma/client";

/**
 * Get all test cases
 * @returns ActionResponse
 */
export async function getAllTestCasesAction(): Promise<ActionResponse> {
  try {
    const testCases = await prisma.testCase.findMany({
      include: {
        steps: {
          include: {
            parameters: true,
          },
        },
        TestSuite: true,
      },
    });
    return {
      status: 200,
      data: testCases,
    };
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    };
  }
}

/**
 * Delete a test case
 * @param id - Test case id
 * @returns ActionResponse
 */
export async function deleteTestCaseAction(
  id: string[]
): Promise<ActionResponse> {
  try {
    await prisma.$transaction(async (tx) => {
      // Delete all step parameters associated with the test case steps
      await tx.testCaseStepParameter.deleteMany({
        where: {
          testCaseStep: {
            testCaseId: {
              in: id,
            },
          },
        },
      });

      // Delete all test case steps
      await tx.testCaseStep.deleteMany({
        where: {
          testCaseId: {
            in: id,
          },
        },
      });

      // Delete the test cases
      await tx.testCase.deleteMany({
        where: { id: { in: id } },
      });
    });

    revalidatePath("/test-cases");
    return {
      status: 200,
      message: "Test case(s) deleted successfully",
    };
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    };
  }
}

/**
 * Create a test case
 * @param testCase - Test case
 * @returns ActionResponse
 */
export async function createTestCaseAction(
  value: z.infer<typeof testCaseSchema>
): Promise<ActionResponse> {
  try {
    testCaseSchema.parse(value);
    const newTestCase = await prisma.testCase.create({
      data: {
        title: value.title,
        description: value.description ?? "",

        TestSuite: {
          connect: value.testSuiteIds.map((id) => ({ id })),
        },
        steps: {
          create: value.steps.map((step) => ({
            gherkinStep: step.gherkinStep,
            label: step.label,
            icon: step.icon,
            parameters: {
              create: step.parameters.map((param) => ({
                name: param.name,
                value: param.value,
                type: param.type as StepParameterType,
                order: param.order,
              })),
            },
            templateStepId: step.templateStepId,
            order: step.order,
          })),
        },
      },
    });
    revalidatePath("/test-cases");
    return {
      status: 200,
      message: "Test case created successfully",
      data: newTestCase,
    };
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    };
  }
}

/**
 * Get a test case by id
 * @param id - Test case id
 * @returns ActionResponse
 */
export async function getTestCaseByIdAction(
  id: string
): Promise<ActionResponse> {
  try {
    const testCase = await prisma.testCase.findUnique({
      where: { id },
      include: {
        steps: true,
        TestSuite: {
          select: {
            id: true,
          },
        },
      },
    });
    return {
      status: 200,
      data: {
        ...testCase,
        testSuiteIds: testCase?.TestSuite.map((suite) => suite.id),
      },
    };
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    };
  }
}

export async function updateTestCaseAction(
  value: z.infer<typeof testCaseSchema>,
  id?: string
): Promise<ActionResponse> {
  if (!id) {
    throw new Error(
      "updateTestCaseAction: 'id' parameter is required for updating a test case."
    );
  }
  try {
    // 1. Find all step IDs for the test case
    const steps = await prisma.testCaseStep.findMany({
      where: { testCaseId: id },
      select: { id: true },
    });
    const stepIds = steps.map((step) => step.id);

    // 2. Delete all parameters for those steps
    if (stepIds.length > 0) {
      await prisma.testCaseStepParameter.deleteMany({
        where: { testCaseStepId: { in: stepIds } },
      });
    }

    // 3. Delete all steps for the test case
    await prisma.testCaseStep.deleteMany({
      where: { testCaseId: id },
    });

    // 4. Then, update the test case with new steps
    const testCase = await prisma.testCase.update({
      where: { id },
      data: {
        title: value.title,
        description: value.description ?? "",
        steps: {
          create: value.steps.map((step) => ({
            gherkinStep: step.gherkinStep,
            label: step.label ?? "",
            icon: step.icon ?? "",
            parameters: {
              create: step.parameters.map((param) => ({
                name: param.name,
                value: param.value,
                type: param.type as StepParameterType,
                order: param.order,
              })),
            },
            templateStepId: step.templateStepId,
            order: step.order,
          })),
        },
      },
      include: {
        steps: true,
      },
    });
    return {
      status: 200,
      message: "Test case updated successfully",
      data: testCase,
    };
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    };
  }
}
