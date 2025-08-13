// action.ts
"use server";

import prisma from "@/config/db-config";
import { testSuiteSchema } from "@/constants/form-opts/test-suite-form-opts";
import { ActionResponse } from "@/types/form/actionHandler";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";

/**
 * Get all test suites
 * @returns ActionResponse
 */
export async function getAllTestSuitesAction(): Promise<ActionResponse> {
  try {
    const testSuites = await prisma.testSuite.findMany({
      include: {
        module: true,
      },
    });
    return {
      status: 200,
      data: testSuites,
    };
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    };
  }
}

/**
 * Create a new test suite
 * @param _prev - Previous state
 * @param value - Test suite data
 * @returns ActionResponse
 */
export async function createTestSuiteAction(
  _prev: unknown,
  value: z.infer<typeof testSuiteSchema>
): Promise<ActionResponse> {
  try {
    testSuiteSchema.parse(value);
    await prisma.testSuite.create({
      data: {
        name: value.name,
        description: value.description,
        module: {
          connect: {
            id: value.moduleId,
          },
        },
        testCases: {
          connect: value.testCases?.map((id) => ({ id })),
        },

      },
    });
    revalidatePath("/test-suites");
    return {
      status: 200,
      message: "Test suite created successfully",
    };
  } catch (e) {
    if (e instanceof ZodError) {
      return {
        status: 400,
        error: e.message,
      };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        status: 500,
        error: e.message,
      };
    }
    return {
      status: 500,
      error: "Server error occurred",
    };
  }
}

/**
 * Delete a test suite
 * @param id - Test suite id
 * @returns ActionResponse
 */
export async function deleteTestSuiteAction(
  id: string[]
): Promise<ActionResponse> {
  try {
    await prisma.testSuite.deleteMany({
      where: { id: { in: id } },
    });
    revalidatePath("/test-suites");
    return {
      status: 200,
      message: "Test suite(s) deleted successfully",
    };
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    };
  }
}

/**
 * Get a test suite by id
 * @param id - Test suite id
 * @returns ActionResponse
 */
export async function getTestSuiteByIdAction(
  id: string
): Promise<ActionResponse> {
  try {
    const testSuite = await prisma.testSuite.findUnique({
      where: { id },
      include: { testCases: true },
    });
    return {
      status: 200,
      data: testSuite,
    };
  } catch (e) {
    console.error(e);
    throw e;
  }
}

/**
 * Update a test suite
 * @param _prev - Previous state
 * @param value - Test suite data
 * @param id - Test suite id
 * @returns ActionResponse
 */
export async function updateTestSuiteAction(
  _prev: unknown,
  value: z.infer<typeof testSuiteSchema>,
  id?: string
): Promise<ActionResponse> {
  try {
    testSuiteSchema.parse(value);
    await prisma.testSuite.update({
      where: { id },
      data: {
        name: value.name,
        description: value.description,
        testCases: {
          set: value.testCases?.map((id) => ({ id })),
        },
        module: {
          connect: {
            id: value.moduleId,
          },
        },
      },
    });
    revalidatePath("/test-suites");
    return {
      status: 200,
      message: "Test suite updated successfully",
    };
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    };
  }
}
