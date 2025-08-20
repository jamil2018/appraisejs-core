"use server";

import prisma from "@/config/db-config";
import { templateStepSchema } from "@/constants/form-opts/template-test-step-form-opts";
import { ActionResponse } from "@/types/form/actionHandler";
import {
  StepParameterType,
  TemplateStepIcon,
  TemplateStepType,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function getAllTemplateStepsAction(): Promise<ActionResponse> {
  try {
    const templateSteps = await prisma.templateStep.findMany({
      include: {
        parameters: {
          select: {
            name: true,
          },
        },
        templateStepGroup: true,
      },
    });
    return {
      status: 200,
      data: templateSteps,
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}

export async function deleteTemplateStepAction(
  templateStepIds: string[]
): Promise<ActionResponse> {
  try {
    await prisma.templateStepParameter.deleteMany({
      where: {
        templateStepId: { in: templateStepIds },
      },
    });

    await prisma.templateStep.deleteMany({
      where: {
        id: { in: templateStepIds },
      },
    });
    revalidatePath("/template-steps");
    return {
      status: 200,
      message: "Template steps deleted successfully",
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}

export async function createTemplateStepAction(
  _prev: unknown,
  value: z.infer<typeof templateStepSchema>
): Promise<ActionResponse> {
  try {
    const newTemplateStep = await prisma.templateStep.create({
      data: {
        name: value.name,
        type: value.type as TemplateStepType,
        signature: value.signature,
        description: value.description || "",
        functionDefinition: value.functionDefinition || "",
        parameters: {
          create: value.params.map((param) => ({
            name: param.name,
            type: param.type as StepParameterType,
            order: param.order,
          })),
        },
        icon: value.icon as TemplateStepIcon,
        templateStepGroup: {
          connect: {
            id: value.templateStepGroupId,
          },
        },
      },
    });

    revalidatePath("/template-steps");

    return {
      status: 200,
      message: "Template step created successfully",
      data: newTemplateStep,
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}

export async function updateTemplateStepAction(
  _prev: unknown,
  value: z.infer<typeof templateStepSchema>,
  id?: string
): Promise<ActionResponse> {
  try {
    const updatedTemplateStep = await prisma.templateStep.update({
      where: { id },
      data: {
        name: value.name,
        type: value.type as TemplateStepType,
        signature: value.signature,
        description: value.description || "",
        functionDefinition: value.functionDefinition || "",
        parameters: {
          deleteMany: {
            templateStepId: id,
          },
          create: value.params.map((param) => ({
            name: param.name,
            type: param.type as StepParameterType,
            order: param.order,
          })),
        },
        icon: value.icon as TemplateStepIcon,
        templateStepGroup: {
          connect: {
            id: value.templateStepGroupId,
          },
        },
      },
    });
    revalidatePath("/template-steps");
    return {
      status: 200,
      message: "Template step updated successfully",
      data: updatedTemplateStep,
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}

export async function getTemplateStepByIdAction(
  id: string
): Promise<ActionResponse> {
  try {
    const templateStep = await prisma.templateStep.findUnique({
      where: { id },
      include: {
        parameters: true,
        templateStepGroup: true,
      },
    });
    return {
      status: 200,
      data: templateStep,
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}

export async function getAllTemplateStepParamsAction(): Promise<ActionResponse> {
  try {
    const templateStepParams = await prisma.templateStepParameter.findMany({});
    return {
      status: 200,
      data: templateStepParams,
    };
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    };
  }
}
