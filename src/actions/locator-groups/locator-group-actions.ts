"use server";
import prisma from "@/config/db-config";
import { locatorGroupSchema } from "@/constants/form-opts/locator-group-form-opts";
import { ActionResponse } from "@/types/form/actionHandler";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function getAllLocatorGroupsAction(): Promise<ActionResponse> {
  try {
    const locatorGroups = await prisma.locatorGroup.findMany({
      include: {
        module: {
          select: {
            name: true,
          },
        },
      },
    });
    return {
      status: 200,
      data: locatorGroups,
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}

export async function createLocatorGroupAction(
  _prev: unknown,
  value: z.infer<typeof locatorGroupSchema>
): Promise<ActionResponse> {
  try {
    const locatorGroup = await prisma.locatorGroup.create({
      data: {
        name: value.name,
        moduleId: value.moduleId,
        locators: {
          connect: value.locators?.map((locator) => ({ id: locator })) || [],
        },
      },
    });
    revalidatePath("/locator-groups");
    return {
      status: 200,
      data: locatorGroup,
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}

export async function getLocatorGroupByIdAction(
  id: string
): Promise<ActionResponse> {
  try {
    const locatorGroup = await prisma.locatorGroup.findUnique({
      where: { id },
      include: {
        module: {
          select: {
            name: true,
          },
        },
      },
    });
    return {
      status: 200,
      data: locatorGroup,
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}

export async function updateLocatorGroupAction(
  _prev: unknown,
  value: z.infer<typeof locatorGroupSchema>,
  id?: string
): Promise<ActionResponse> {
  try {
    const locatorGroup = await prisma.locatorGroup.update({
      where: { id },
      data: {
        name: value.name,
        moduleId: value.moduleId,
        locators: {
          set: value.locators?.map((locator) => ({ id: locator })) || [],
        },
      },
      include: {
        module: {
          select: {
            name: true,
          },
        },
      },
    });
    revalidatePath("/locator-groups");
    return {
      status: 200,
      data: locatorGroup,
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}

export async function deleteLocatorGroupAction(
  ids: string[]
): Promise<ActionResponse> {
  try {
    await prisma.locatorGroup.deleteMany({
      where: { id: { in: ids } },
    });
    revalidatePath("/locator-groups");
    return {
      status: 200,
      data: ids,
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}
