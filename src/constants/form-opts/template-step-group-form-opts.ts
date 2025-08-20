import { formOptions } from "@tanstack/react-form/nextjs";
import { z } from "zod";

export const templateStepGroupSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters" }),
  description: z.string().optional(),
});

export type TemplateStepGroup = z.infer<typeof templateStepGroupSchema>;

export const formOpts = formOptions({
  defaultValues: {
    name: "",
    description: "",
  } as TemplateStepGroup,
  validators: {
    onChange: templateStepGroupSchema,
  },
});
