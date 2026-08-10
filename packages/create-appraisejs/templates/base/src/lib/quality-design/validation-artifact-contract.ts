import { z } from 'zod'

import { stepInvocationSchema } from '../../../packages/cucumber-runtime/src/step-definitions/contracts'

const id = z.string().min(1)
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/)

/** The reusable executable-validation projection. Quality publication owns this
 * contract; development-plan lifecycle fields are intentionally absent. */
export const validationArtifactSchema = z
  .object({
    validations: z
      .array(
        z
          .object({
            id,
            testCaseIds: z.array(id).min(1),
            appraiseArtifacts: z.object({
              modules: z.array(z.object({ id, name: z.string(), parentId: id.nullable().optional() })).default([]),
              locatorGroups: z.array(z.object({ id, name: z.string(), route: z.string(), moduleId: id })).default([]),
              testSuites: z
                .array(z.object({ id, name: z.string(), moduleId: id, testCaseIds: z.array(id).min(1) }))
                .min(1),
              testCases: z
                .array(
                  z.object({
                    id,
                    title: z.string(),
                    description: z.string(),
                    steps: z.array(
                      z.object({
                        id,
                        order: z.number().int(),
                        label: z.string(),
                        gherkinStep: z.string(),
                        invocation: stepInvocationSchema.optional(),
                        parameters: z.array(z.unknown()).default([]),
                      }),
                    ),
                  }),
                )
                .min(1),
              locators: z.array(z.object({ id, name: z.string(), value: z.string(), locatorGroupId: id })).default([]),
            }),
            astProvenance: z
              .object({
                schemaVersion: z.literal('2'),
                astHash: hash,
                executionAuthority: z.literal('reviewed_publication'),
                publishOperationId: id,
                receiptHash: hash,
                runtimeInputHash: hash,
              })
              .optional(),
            matrix: z.array(z.object({ browser: z.string(), environment: z.string() })).min(1),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough()

/** The executable fields are inferred from the sealed runtime schema. Extra
 * compiler metadata stays accepted by the schema but is never executed. */
export type ValidationArtifact = z.infer<typeof validationArtifactSchema>
