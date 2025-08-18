"use server";

import prisma from "@/config/db-config";
import { locatorSchema } from "@/constants/form-opts/locator-form-opts";
import { ActionResponse } from "@/types/form/actionHandler";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function getAllLocatorsAction(): Promise<ActionResponse> {
  try {
    const locators = await prisma.locator.findMany({
      include: {
        locatorGroup: {
          select: {
            name: true,
          },
        },
      },
    });
    return {
      status: 200,
      data: locators,
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}

export async function deleteLocatorAction(
  ids: string[]
): Promise<ActionResponse> {
  try {
    const locator = await prisma.locator.deleteMany({
      where: { id: { in: ids } },
    });
    revalidatePath("/locators");
    return {
      status: 200,
      data: locator,
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}

export async function createLocatorAction(
  _prev: unknown,
  value: z.infer<typeof locatorSchema>
): Promise<ActionResponse> {
  try {
    locatorSchema.parse(value);

    const newLocator = await prisma.locator.create({
      data: {
        name: value.name,
        value: value.value,
        locatorGroupId: value.locatorGroupId,
      },
      include: {
        locatorGroup: {
          select: {
            name: true,
          },
        },
      },
    });
    revalidatePath("/locators");
    return {
      status: 200,
      data: newLocator,
      message: "Locator created successfully",
    };
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    };
  }
}

export async function updateLocatorAction(
  _prev: unknown,
  value: z.infer<typeof locatorSchema>,
  id?: string
): Promise<ActionResponse> {
  try {
    const updatedLocator = await prisma.locator.update({
      where: { id },
      data: {
        name: value.name,
        value: value.value,
        locatorGroupId: value.locatorGroupId,
      },
      include: {
        locatorGroup: {
          select: {
            name: true,
          },
        },
      },
    });
    revalidatePath("/locators");
    return {
      status: 200,
      data: updatedLocator,
      message: "Locator updated successfully",
    };
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    };
  }
}

export async function getLocatorByIdAction(
  id: string
): Promise<ActionResponse> {
  try {
    const locator = await prisma.locator.findUnique({
      where: { id },
      include: {
        locatorGroup: {
          select: {
            name: true,
          },
        },
      },
    });
    return {
      status: 200,
      data: locator,
    };
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    };
  }
}

export async function getUngroupedLocatorsAction(): Promise<ActionResponse> {
  try {
    const locators = await prisma.locator.findMany({
      where: {
        locatorGroupId: null,
      },
      select: {
        id: true,
        name: true,
        value: true,
      },
    });
    return {
      status: 200,
      data: locators,
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}
