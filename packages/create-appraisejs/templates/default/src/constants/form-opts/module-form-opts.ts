import { z } from 'zod'

// Special UUID to represent root (no parent) in the form
export const ROOT_MODULE_UUID = '00000000-0000-0000-0000-000000000000'

export const moduleSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  parentId: z.string().optional().or(z.undefined()),
})

export type Module = z.infer<typeof moduleSchema>

export const formOpts = {
  defaultValues: {
    name: '',
    parentId: ROOT_MODULE_UUID,
  },
  validators: {
    onChange: moduleSchema,
  },
}
