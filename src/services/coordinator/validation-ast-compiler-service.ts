import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import type { ValidationArtifact } from '@/lib/plan-contract'
import {
  compileCustomExtension,
  createCustomExtensionPolicy,
  createValidationAstCanonicalProjection,
  customActionExtensionProposalSchema,
  validationAstHash,
  validationAstSchema,
  type CustomActionExtensionProposal,
  type ValidationAst,
} from '@/lib/validation-ast'
import { ServiceError } from '@/services/shared/errors'
import { validationAstExtensionReferences } from '@/lib/validation-ast/extension-references'
import { projectCompiledValidationArtifacts } from './validation-canonical-projection-service'

export const PROJECT_EXTENSION_CAPABILITY_IMPORTS = {
  browser: ['@playwright/test'],
} as const

export type ResolvedLocatorBinding = {
  refId: string
  id: string
  name: string
  value: string
  groupId: string
  groupName: string
  moduleId: string
  route: string
}

export function compileValidationAstNode(
  astValue: unknown,
  resolvedLocators: ResolvedLocatorBinding[] = [],
  planScope = 'unscoped',
) {
  const ast = validationAstSchema.parse(astValue) as ValidationAst
  return createValidationAstCanonicalProjection(ast, planScope, resolvedLocators).validationNode
}

export function mergeCompiledValidationNode(
  validation: ValidationArtifact,
  node: ValidationArtifact['validations'][number],
) {
  return {
    ...validation,
    validations: [...validation.validations.filter(item => item.id !== node.id), node],
  }
}

export async function compileValidationAstToCanonicalEntities(
  input: {
    planId: string
    ast: unknown
    expectedAstHash: string
    expectedProjectionHash?: string
    customExtensionProposals?: unknown[]
    expectedCompiledExtensionHashes?: Record<string, string>
    validation: ValidationArtifact
    resolvedLocators?: ResolvedLocatorBinding[]
    planScope?: string
    assertCurrent?: (transaction: PrismaClient) => Promise<void>
  },
  client: PrismaClient = prisma,
) {
  const result = await buildCompiledValidationAstResult(input, client)
  const counts = await projectCompiledValidationArtifacts(
    {
      planId: input.planId,
      validation: result.validation,
      astId: result.astId,
      astHash: result.astHash,
      compiledExtensions: result.compiledExtensions,
      assertCurrent: input.assertCurrent,
    },
    client,
  )
  return { ...result, counts }
}

function referencedExtensionKeys(ast: ValidationAst) {
  return new Set(validationAstExtensionReferences(ast).map(value => `${value.id}@${value.version}`))
}

function validateExtensionSets(ast: ValidationAst, proposals: CustomActionExtensionProposal[]) {
  const proposalKeys = new Set(proposals.map(proposal => `${proposal.id}@${proposal.version}`))
  if (proposalKeys.size !== proposals.length)
    throw new ServiceError('Duplicate custom extension identity.', 'VALIDATION')
  const referencedKeys = referencedExtensionKeys(ast)
  const undeclared = proposals.find(proposal => !ast.customExtensions.includes(proposal.id))
  if (undeclared)
    throw new ServiceError(`Custom extension "${undeclared.id}" is not declared by the Validation AST.`, 'VALIDATION')
  const missing = ast.customExtensions.find(id => ![...proposalKeys].some(key => key.startsWith(`${id}@`)))
  if (missing) throw new ServiceError(`Custom extension proposal is missing for "${missing}".`, 'VALIDATION')
  const mismatched =
    proposalKeys.size !== referencedKeys.size ||
    [...proposalKeys].some(key => !referencedKeys.has(key)) ||
    referencedKeys.size !== ast.customExtensions.length
  if (mismatched)
    throw new ServiceError('Declared, proposed, and referenced custom extensions do not match.', 'VALIDATION')
}

export async function buildCompiledValidationAstResult(
  input: Parameters<typeof compileValidationAstToCanonicalEntities>[0],
  client: PrismaClient = prisma,
) {
  const ast = validationAstSchema.parse(input.ast)
  const astHash = validationAstHash(ast)
  if (astHash !== input.expectedAstHash)
    throw new ServiceError('Validation AST hash changed before compilation.', 'CONFLICT')
  const projection = createValidationAstCanonicalProjection(
    ast,
    input.planScope ?? input.planId,
    input.resolvedLocators ?? [],
  )
  if (input.expectedProjectionHash && projection.projectionHash !== input.expectedProjectionHash)
    throw new ServiceError('Canonical Validation AST projection changed after preview.', 'CONFLICT')
  const node = projection.validationNode
  const proposals = (input.customExtensionProposals ?? []).map(value =>
    customActionExtensionProposalSchema.parse(value),
  ) as CustomActionExtensionProposal[]
  validateExtensionSets(ast, proposals)
  const plan = proposals.length
    ? await client.planProjection.findUnique({
        where: { planId: input.planId },
        select: { targetProject: { select: { id: true, fingerprint: true } } },
      })
    : null
  if (proposals.length && !plan?.targetProject)
    throw new ServiceError('A target project is required to compile custom extensions.', 'VALIDATION')
  const compiledExtensions = proposals
    .map(proposal =>
      compileCustomExtension(proposal, {
        policy: createCustomExtensionPolicy({
          projectId: plan!.targetProject!.id,
          projectFingerprint: plan!.targetProject!.fingerprint,
          capabilityImports: PROJECT_EXTENSION_CAPABILITY_IMPORTS,
        }),
      }),
    )
    .sort((left, right) =>
      `${left.extension.id}@${left.extension.version}`.localeCompare(
        `${right.extension.id}@${right.extension.version}`,
      ),
    )
  for (const extension of compiledExtensions) {
    const key = `${extension.extension.id}@${extension.extension.version}`
    if (input.expectedCompiledExtensionHashes?.[key] !== extension.compiledHash)
      throw new ServiceError(`Reviewed custom extension hash changed for "${key}".`, 'CONFLICT')
  }
  const validation = mergeCompiledValidationNode(input.validation, node)
  return { astHash, astId: ast.id, validationNode: node, validation, compiledExtensions }
}
