import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

export const GENERATED_AUTOMATION_MARKER = '.appraise-generated.json'

const generatedAutomationOwnershipSchema = z
  .object({
    schemaVersion: z.literal('1'),
    owner: z.literal('appraise'),
    authority: z.literal('reviewed-validation-ast'),
    mutationPolicy: z.literal('replace-through-appraise-export-only'),
    projectId: z.string().min(1),
    validationHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    publishOperationId: z.string().min(1),
    authoredExtensionPaths: z.array(z.string()).max(128),
  })
  .strict()

export async function readGeneratedAutomationOwnership(directory: string) {
  try {
    return generatedAutomationOwnershipSchema.parse(
      JSON.parse(await fs.readFile(path.join(directory, GENERATED_AUTOMATION_MARKER), 'utf8')),
    )
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}
