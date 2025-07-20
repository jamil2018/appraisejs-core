"use server";

import prisma from "@/config/db-config";
import { ActionResponse } from "@/types/form/actionHandler";
import { revalidatePath } from "next/cache";
import { templateTestCaseSchema } from "@/constants/form-opts/template-test-case-form-opts";
import { StepParameterType } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/auth";

export async function getAllTemplateTestCasesAction(): Promise<ActionResponse> {
  try {
    const templateTestCases = await prisma.templateTestCase.findMany({
      include: {
        steps: {
          include: {
            parameters: true,
          },
        },
      },
    });

    return {
      status: 200,
      data: templateTestCases,
    };
  } catch (e) {
    return {
      status: 500,
      message: `Server error occurred: ${e}`,
    };
  }
}

export async function deleteTemplateTestCaseAction(
  id: string[]
): Promise<ActionResponse> {
  try {
    const deletedTemplateTestCase = await prisma.templateTestCase.deleteMany({
      where: { id: { in: id } },
    });
    revalidatePath("/template-test-cases");
    return {
      status: 200,
      message: "Template test case deleted successfully",
      data: deletedTemplateTestCase,
    };
  } catch (e) {
    return {
      status: 500,
      message: `Server error occurred: ${e}`,
    };
  }
}

/**
 * Create a test case
 * @param testCase - Test case
 * @returns ActionResponse
 */
export async function createTemplateTestCaseAction(
  value: z.infer<typeof templateTestCaseSchema>
): Promise<ActionResponse> {
  try {
    templateTestCaseSchema.parse(value);
    const session = await auth();
    const newTemplateTestCase = await prisma.templateTestCase.create({
      data: {
        name: value.title,
        description: value.description ?? "",
        steps: {
          create: value.steps.map((step) => ({
            gherkinStep: step.gherkinStep,
            label: step.label,
            icon: step.icon,
            parameters: {
              create: step.parameters.map((param) => ({
                name: param.name,
                defaultValue: param.value,
                type: param.type as StepParameterType,
                order: param.order,
              })),
            },
            TemplateStep: {
              connect: {
                id: step.templateStepId,
              },
            },
            order: step.order,
          })),
        },
        creator: {
          connect: {
            id: session?.user?.id,
          },
        },
      },
    });
    revalidatePath("/template-test-cases");
    return {
      status: 200,
      message: "Template test case created successfully",
      data: newTemplateTestCase,
    };
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    };
  }
}
