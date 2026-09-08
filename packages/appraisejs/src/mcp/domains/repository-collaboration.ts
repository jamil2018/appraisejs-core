import type { McpRegistryContext } from '../registry.js'
import { text, z } from '../shared.js'

const id = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const target = z.string().trim().min(1)
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const policyVersion = z.number().int().positive()
const records = z.array(z.unknown()).min(1).max(10_000)

const connectInput = z
  .object({
    target,
    repositoryRoot: z.string().trim().min(1),
    remoteName: z.string().trim().min(1).max(200).optional(),
    trackedBranch: z.string().trim().min(1).max(300),
    portableProjectId: id.optional(),
  })
  .strict()
const policyUpdateInput = z
  .object({
    target,
    changes: z
      .object({
        OBSERVE: z.boolean().optional(),
        PREPARE: z.boolean().optional(),
        INTEGRATE: z.boolean().optional(),
        COMMIT: z.boolean().optional(),
        PUSH: z.boolean().optional(),
        RESOLVE: z.boolean().optional(),
        ARCHIVE: z.boolean().optional(),
      })
      .strict()
      .refine(value => Object.keys(value).length > 0, 'At least one policy change is required.'),
  })
  .strict()
const prepareInput = z
  .object({
    target,
    intent: z.enum(['RECEIVE', 'PUBLISH', 'RECONCILE', 'UNDO']),
    idempotencyKey: id,
    expectedPolicyVersion: policyVersion,
    trigger: z.string().trim().min(1).max(200).optional(),
    divergent: z
      .object({ operationId: id, expectedVersion: z.number().int().positive(), preparedDigest: sha256 })
      .strict()
      .optional(),
  })
  .strict()
const getInput = z.object({ target, operationId: id }).strict()
const resolutionProposeInput = z
  .object({
    target,
    operationId: id,
    expectedVersion: z.number().int().positive(),
    preparedDigest: sha256,
    records,
  })
  .strict()
const decideInput = z
  .object({
    target,
    operationId: id,
    expectedVersion: z.number().int().positive(),
    preparedDigest: sha256,
    decisions: z
      .array(
        z
          .object({
            recordKey: id,
            decision: z.enum(['KEEP_LOCAL', 'USE_INCOMING', 'EDIT']),
            editedRecord: z.unknown().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(2_000),
  })
  .strict()
const executeInput = z
  .object({
    target,
    operationId: id,
    expectedVersion: z.number().int().positive(),
    preparedDigest: sha256,
    idempotencyKey: id,
  })
  .strict()
const undoPrepareInput = z
  .object({ target, operationId: id, expectedPolicyVersion: policyVersion, idempotencyKey: id, trigger: id.optional() })
  .strict()
const workerRegisterInput = z
  .object({
    target,
    workerIdentity: id,
    capabilities: z.array(id).min(1).max(100),
    ttlMs: z.number().int().min(5_000).max(300_000).optional(),
  })
  .strict()
const workIdentity = { target, workerIdentity: id, sessionNonce: id }
const workClaimInput = z
  .object({ ...workIdentity, leaseMs: z.number().int().min(1_000).max(300_000).optional() })
  .strict()
const workLease = {
  ...workIdentity,
  operationId: id,
  attemptId: id,
  fencingToken: z.number().int().positive(),
  leaseToken: id,
}
const workHeartbeatInput = z
  .object({ ...workLease, leaseMs: z.number().int().min(1_000).max(300_000).optional() })
  .strict()
const workCompleteInput = z.object({ ...workLease, proposal: z.record(z.string(), z.unknown()) }).strict()
const handoffRedeemInput = z.object({ target, token: id, redeemedBy: id }).strict()

/** Public, project-bound collaboration tools. They accept records and leases, never paths, shell commands, or grant provenance. */
export function registerRepositoryCollaborationOperations({ server, api }: McpRegistryContext): void {
  server.registerTool(
    'collaboration_status',
    {
      description:
        'Read the bounded collaboration connection, policy, operations, decisions, and receipts for one target.',
      inputSchema: { target },
    },
    async ({ target }) => text(await api.collaborationStatus(target)),
  )
  const definitions = [
    [
      'collaboration_connect',
      connectInput,
      'collaborationConnect',
      'Connect one registered local target to its canonical repository root.',
    ],
    [
      'collaboration_policy_update',
      policyUpdateInput,
      'collaborationPolicyUpdate',
      'Change explicit collaboration permissions through the authenticated local coordinator.',
    ],
    [
      'collaboration_prepare',
      prepareInput,
      'collaborationPrepare',
      'Prepare a durable receive, publish, reconcile, undo, or isolated divergent review; no arbitrary Git command is accepted.',
    ],
    [
      'collaboration_get',
      getInput,
      'collaborationGet',
      'Read one target-scoped durable collaboration operation and its sanitized decision and journal summaries.',
    ],
    [
      'collaboration_resolution_propose',
      resolutionProposeInput,
      'collaborationResolutionPropose',
      'Submit a complete record-only proposal to an existing isolated divergent reconciliation worktree.',
    ],
    [
      'collaboration_decide',
      decideInput,
      'collaborationDecide',
      'Record reviewed whole-record resolutions; the authenticated coordinator derives trusted decision provenance.',
    ],
    [
      'collaboration_execute',
      executeInput,
      'collaborationExecute',
      'Execute only the exact prepared database operation or fixed persisted Git step named by the operation.',
    ],
    [
      'collaboration_undo_prepare',
      undoPrepareInput,
      'collaborationUndoPrepare',
      'Prepare a guarded inverse only when its durable before-image and current state still match.',
    ],
    [
      'collaboration_worker_register',
      workerRegisterInput,
      'collaborationWorkerRegister',
      'Register observed worker capabilities and receive a short-lived session nonce; this never claims wake capability.',
    ],
    [
      'collaboration_work_claim',
      workClaimInput,
      'collaborationWorkClaim',
      'Claim the next leaseable collaboration operation for one registered worker session.',
    ],
    [
      'collaboration_work_heartbeat',
      workHeartbeatInput,
      'collaborationWorkHeartbeat',
      'Renew an exact fenced collaboration work lease.',
    ],
    [
      'collaboration_work_complete',
      workCompleteInput,
      'collaborationWorkComplete',
      'Submit a structured worker proposal; this does not make a reviewer decision or mutate authored records.',
    ],
    [
      'collaboration_handoff_redeem',
      handoffRedeemInput,
      'collaborationHandoffRedeem',
      'Redeem one target-bound handoff ticket and return its sanitized prepared scope.',
    ],
  ] as const
  for (const [name, schema, method, description] of definitions) {
    server.registerTool(name, { description, inputSchema: schema.shape }, async (input: unknown) =>
      text(await api[method](schema.parse(input))),
    )
  }
}
