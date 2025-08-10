import { formOptions } from "@tanstack/react-form/nextjs";
import { z } from "zod";

export const moduleSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }),
  parentId: z.string().optional(),
});

export type Module = z.infer<typeof moduleSchema>;

export const formOpts = formOptions({
  defaultValues: {
    name: "",
    parentId: undefined,
  },
  validators: {
    onChange: moduleSchema,
  },
});
