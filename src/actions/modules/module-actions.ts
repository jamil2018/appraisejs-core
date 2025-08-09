"use server";

import prisma from "@/config/db-config";
import { ActionResponse } from "@/types/form/actionHandler";

export async function getAllModulesAction(): Promise<ActionResponse> {
  try {
    const modules = await prisma.module.findMany({
      include: {
        parent: {
          select: {
            name: true,
          },
        },
      },
    });
    return {
      status: 200,
      data: modules,
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}

export async function deleteModuleAction(
  ids: string[]
): Promise<ActionResponse> {
  try {
    await prisma.module.deleteMany({
      where: {
        id: { in: ids },
      },
    });
    return {
      status: 200,
      message: "Modules deleted successfully",
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}
