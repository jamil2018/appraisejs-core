import { promises as fs } from 'node:fs'
import path from 'node:path'

import { isAlias, parseDocument, visit } from 'yaml'
import { z } from 'zod'

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const planArtifactSchema = z
  .object({
    version: z.literal('1'),
    planId: idSchema,
    revision: z.number().int().positive(),
    lifecycle: z.enum([
      'draft',
      'awaiting_plan_review',
      'preparing_validations',
      'awaiting_validation_review',
      'running_baseline',
      'awaiting_baseline_acceptance',
      'implementing',
      'validation_passed',
      'completed',
      'cancelled',
    ]),
    goal: z
      .string()
      .min(1)
      .max(80)
      .describe('Short plan title, limited to 80 characters. Put supporting detail in description.'),
    description: z.string().min(1).describe('Concise summary of the plan scope, intent, and expected outcome.'),
    tasks: z
      .array(
        z.object({
          id: idSchema,
          title: z.string().min(1),
          description: z.string().min(1),
          acceptanceCriteria: z.array(z.string().min(1)).min(1),
          validationIntent: z.string().min(1),
        }),
      )
      .min(1),
    edges: z.array(
      z.object({
        from: idSchema,
        to: idSchema,
        type: z.enum(['depends-on', 'blocks', 'relates-to']),
      }),
    ),
    implementationGroups: z.array(z.object({ id: idSchema, taskIds: z.array(idSchema).min(1) })),
  })
  .strict()
  .superRefine((plan, context) => {
    const taskIds = new Set(plan.tasks.map(task => task.id))
    if (taskIds.size !== plan.tasks.length) {
      context.addIssue({ code: 'custom', path: ['tasks'], message: 'Plan task IDs must be unique.' })
    }
    for (const [index, edge] of plan.edges.entries()) {
      if (!taskIds.has(edge.from) || !taskIds.has(edge.to)) {
        context.addIssue({
          code: 'custom',
          path: ['edges', index],
          message: 'Plan edges must reference existing tasks.',
        })
      }
    }
    for (const [index, group] of plan.implementationGroups.entries()) {
      if (group.taskIds.some(taskId => !taskIds.has(taskId))) {
        context.addIssue({
          code: 'custom',
          path: ['implementationGroups', index, 'taskIds'],
          message: 'Implementation groups must reference existing tasks.',
        })
      }
    }
  })

export type PlanFile = z.infer<typeof planArtifactSchema>

function assertNoYamlReferences(document: ReturnType<typeof parseDocument>): void {
  let blockedReference: 'anchor' | 'alias' | undefined
  visit(document, {
    Alias() {
      blockedReference = 'alias'
      return visit.BREAK
    },
    Node(_, node) {
      if (node && 'anchor' in node && node.anchor) {
        blockedReference = 'anchor'
        return visit.BREAK
      }
      if (isAlias(node)) {
        blockedReference = 'alias'
        return visit.BREAK
      }
    },
  })
  if (blockedReference) throw new Error(`YAML ${blockedReference}s are not allowed.`)
}

async function readPlanFile(file: string): Promise<PlanFile> {
  const source = await fs.readFile(file, 'utf8')
  if (Buffer.byteLength(source, 'utf8') > 1_048_576) throw new Error('Plan file exceeds the 1 MB limit.')
  const document = parseDocument(source, { prettyErrors: false, strict: true, uniqueKeys: true })
  if (document.errors.length) throw new Error(`Invalid plan file: ${document.errors[0]?.message ?? 'YAML parse error'}`)
  assertNoYamlReferences(document)
  return planArtifactSchema.parse(document.toJS({ maxAliasCount: 0 }))
}

export async function validatePlanFile(file: string) {
  const plan = await readPlanFile(path.resolve(file))
  return {
    ok: true as const,
    schema: 'appraise.plan/v1',
    file: path.resolve(file),
    planId: plan.planId,
    revision: plan.revision,
    lifecycle: plan.lifecycle,
    taskCount: plan.tasks.length,
  }
}

export async function createOfflineDraft(file: string, cwd: string) {
  const validation = await validatePlanFile(file)
  if (validation.lifecycle !== 'draft') throw new Error('Offline plan creation requires the draft lifecycle.')
  const destination = path.join(path.resolve(cwd), 'appraise', 'plans', `${validation.planId}.yaml`)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.copyFile(path.resolve(file), destination, fs.constants.COPYFILE_EXCL)
  return {
    ok: true as const,
    mode: 'offline' as const,
    planId: validation.planId,
    lifecycle: validation.lifecycle,
    path: destination,
    warning: 'Offline drafts are not registered with AppraiseJS. Start the app and create the plan online to continue.',
  }
}

export async function readValidatedPlan(file: string): Promise<PlanFile> {
  await validatePlanFile(file)
  return readPlanFile(path.resolve(file))
}
