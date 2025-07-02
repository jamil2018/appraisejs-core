"use server";

import prisma from "@/config/db-config";
import { ActionResponse } from "@/types/form/actionHandler";
import { revalidatePath } from "next/cache";

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
