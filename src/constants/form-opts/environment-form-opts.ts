import { z } from 'zod'

export const environmentSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  baseUrl: z.string().url({ message: 'Base URL must be a valid URL' }),
  expectedPageTitle: z.string().trim().max(200).optional().or(z.literal('')),
  apiBaseUrl: z.string().url({ message: 'API Base URL must be a valid URL' }).optional().or(z.literal('')),
  username: z.string().optional().or(z.literal('')),
  passwordEnvironmentVariable: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, { message: 'Use a valid process environment variable name' })
    .optional()
    .or(z.literal('')),
})

export type Environment = z.infer<typeof environmentSchema>

export const environmentFormOpts = {
  defaultValues: {
    name: '',
    baseUrl: '',
    expectedPageTitle: '',
    apiBaseUrl: '',
    username: '',
    passwordEnvironmentVariable: '',
  },
  validators: {
    onChange: environmentSchema,
  },
}
