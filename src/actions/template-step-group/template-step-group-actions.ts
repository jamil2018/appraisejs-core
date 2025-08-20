"use server";

import prisma from "@/config/db-config";
import { templateStepGroupSchema } from "@/constants/form-opts/template-step-group-form-opts";
import { ActionResponse } from "@/types/form/actionHandler";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";

/**
 * Get all template step groups
 * @returns ActionResponse
 */
export async function getAllTemplateStepGroupsAction(): Promise<ActionResponse> {
  try {
    const templateStepGroups = await prisma.templateStepGroup.findMany();
    return {
      status: 200,
      data: templateStepGroups,
    };
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    };
  }
}

/**
 * Create a new template step group
 * @param _prev - Previous state
 * @param value - Template step group data
 * @returns ActionResponse
 */
export async function createTemplateStepGroupAction(
  _prev: unknown,
  value: z.infer<typeof templateStepGroupSchema>
): Promise<ActionResponse> {
  try {
    templateStepGroupSchema.parse(value);

    // Create the template step group
    await prisma.templateStepGroup.create({
      data: {
        name: value.name,
        description: value.description,
      },
    });

    revalidatePath("/template-step-groups");
    return {
      status: 200,
      message: "Template step group created successfully",
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
 * Delete a template step group
 * @param id - Template step group id(s)
 * @returns ActionResponse
 */
export async function deleteTemplateStepGroupAction(
  id: string[]
): Promise<ActionResponse> {
  try {
    await prisma.templateStepGroup.deleteMany({
      where: { id: { in: id } },
    });
    revalidatePath("/template-step-groups");
    return {
      status: 200,
      message: "Template step group(s) deleted successfully",
    };
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    };
  }
}

/**
 * Get a template step group by id
 * @param id - Template step group id
 * @returns ActionResponse
 */
export async function getTemplateStepGroupByIdAction(
  id: string
): Promise<ActionResponse> {
  try {
    const templateStepGroup = await prisma.templateStepGroup.findUnique({
      where: { id },
    });
    return {
      status: 200,
      data: templateStepGroup,
    };
  } catch (e) {
    console.error(e);
    throw e;
  }
}

/**
 * Update a template step group
 * @param _prev - Previous state
 * @param value - Template step group data
 * @param id - Template step group id
 * @returns ActionResponse
 */
export async function updateTemplateStepGroupAction(
  _prev: unknown,
  value: z.infer<typeof templateStepGroupSchema>,
  id?: string
): Promise<ActionResponse> {
  try {
    templateStepGroupSchema.parse(value);

    if (!id) {
      return {
        status: 400,
        error: "Template step group ID is required",
      };
    }

    // Update the template step group
    await prisma.templateStepGroup.update({
      where: { id },
      data: {
        name: value.name,
        description: value.description,
      },
    });

    revalidatePath("/template-step-groups");
    return {
      status: 200,
      message: "Template step group updated successfully",
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
