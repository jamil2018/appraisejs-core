"use server";

import prisma from "@/config/db-config";
import { moduleSchema } from "@/constants/form-opts/module-form-opts";
import { ActionResponse } from "@/types/form/actionHandler";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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
    revalidatePath("/modules");
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

export async function createModuleAction(
  _prev: unknown,
  value: z.infer<typeof moduleSchema>
): Promise<ActionResponse> {
  try {
    moduleSchema.parse(value);

    const newModule = await prisma.module.create({
      data: {
        ...value,
      },
    });
    revalidatePath("/modules");
    return {
      status: 200,
      data: newModule,
      message: "Module created successfully",
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}
