import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { scanFeatureFiles } from '@/lib/gherkin-parser'

const MAX_FILES = 512
const MAX_FILE_BYTES = 256 * 1024
const MAX_WARNINGS = 512

const relativePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(value => !path.isAbsolute(value) && !value.split('/').includes('..'), 'Path must be contained and relative.')

const sourceSchema = z.object({
  path: relativePathSchema,
  hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  size: z.number().int().nonnegative(),
})

const legacyAutomationImportProposalSchema = z
  .object({
    schemaVersion: z.literal('1'),
    kind: z.literal('legacy-automation-import-proposal'),
    reviewStatus: z.literal('human-review-required'),
    mutationPerformed: z.literal(false),
    sourceRoot: z.literal('automation'),
    sourceHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    proposalHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sources: z.array(sourceSchema).max(MAX_FILES),
    features: z.array(
      z.object({
        sourcePath: relativePathSchema,
        title: z.string(),
        description: z.string().optional(),
        tags: z.array(z.string()),
        scenarios: z.array(
          z.object({
            title: z.string(),
            description: z.string().optional(),
            tags: z.array(z.string()),
            steps: z.array(
              z.object({
                keyword: z.string(),
                description: z.string(),
                order: z.number().int().positive(),
                sourceNodeId: z.string().optional(),
                actionMapping: z.literal('unresolved'),
              }),
            ),
          }),
        ),
      }),
    ),
    stepDefinitions: z.array(z.object({ sourcePath: relativePathSchema, expressions: z.array(z.string()) })),
    locators: z.array(
      z.object({
        sourcePath: relativePathSchema,
        name: z.string(),
        selector: z.string(),
        mapping: z.literal('unresolved'),
      }),
    ),
    warnings: z.array(z.string()).max(MAX_WARNINGS),
  })
  .strict()

export type LegacyAutomationImportProposal = z.infer<typeof legacyAutomationImportProposalSchema>

const digest = (value: string | Uint8Array) => `sha256:${createHash('sha256').update(value).digest('hex')}`
const portable = (root: string, file: string) => path.relative(root, file).split(path.sep).join('/')

async function containedFiles(root: string) {
  const files: string[] = []
  async function visit(directory: string) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Legacy import rejects symlinked automation entries.')
      const next = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(next)
      else if (entry.isFile()) files.push(next)
      if (files.length > MAX_FILES) throw new Error(`Legacy import exceeds the ${MAX_FILES}-file limit.`)
    }
  }
  try {
    if ((await fs.lstat(root)).isSymbolicLink()) throw new Error('Legacy import rejects a symlinked automation root.')
    await visit(root)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return []
    throw error
  }
  return files.sort()
}

function stepExpressions(source: string) {
  const expressions: string[] = []
  const matcher = /\b(?:Given|When|Then|defineStep)\s*\(\s*(?:['"`]([^'"`]+)['"`]|\/((?:\\.|[^/])+)\/[gimsuy]*)/g
  for (const match of source.matchAll(matcher)) expressions.push((match[1] ?? match[2] ?? '').slice(0, 2_000))
  return expressions
}

function locatorEntries(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value).flatMap(([name, selector]) =>
    typeof selector === 'string' ? [{ name, selector, mapping: 'unresolved' as const }] : [],
  )
}

// The importer intentionally coordinates bounded file inventory, legacy parsing, and proposal assembly in one pass.
// fallow-ignore-next-line complexity
export async function previewLegacyAutomationImport(projectRoot: string): Promise<LegacyAutomationImportProposal> {
  const canonicalProjectRoot = await fs.realpath(projectRoot)
  const automationRoot = path.join(canonicalProjectRoot, 'automation')
  const files = await containedFiles(automationRoot)
  const sources = []
  const stepDefinitions = []
  const locators = []
  const warnings: string[] = []

  for (const file of files) {
    const relative = portable(canonicalProjectRoot, file)
    const bytes = await fs.readFile(file)
    sources.push({ path: relative, hash: digest(bytes), size: bytes.byteLength })
    if (bytes.byteLength > MAX_FILE_BYTES) {
      warnings.push(`${relative}: skipped because it exceeds ${MAX_FILE_BYTES} bytes.`)
      continue
    }
    if (/automation\/steps\/.*\.(?:[cm]?[jt]s)$/.test(relative)) {
      stepDefinitions.push({ sourcePath: relative, expressions: stepExpressions(bytes.toString('utf8')) })
    }
    if (/automation\/locators\/.*\.json$/.test(relative)) {
      try {
        for (const locator of locatorEntries(JSON.parse(bytes.toString('utf8'))))
          locators.push({ sourcePath: relative, ...locator })
      } catch {
        warnings.push(`${relative}: locator JSON could not be parsed.`)
      }
    }
  }

  const parsed = files.length ? await scanFeatureFiles(path.join(automationRoot, 'features')) : []
  const features = parsed.map(feature => ({
    sourcePath: portable(canonicalProjectRoot, feature.filePath),
    title: feature.featureName,
    ...(feature.featureDescription ? { description: feature.featureDescription } : {}),
    tags: feature.tags,
    scenarios: feature.scenarios.map(scenario => ({
      title: scenario.name,
      ...(scenario.description ? { description: scenario.description } : {}),
      tags: scenario.tags,
      steps: scenario.steps.map(step => ({
        keyword: step.keyword,
        description: step.text,
        order: step.order,
        ...(step.appraiseNode?.nodeId ? { sourceNodeId: step.appraiseNode.nodeId } : {}),
        actionMapping: 'unresolved' as const,
      })),
    })),
  }))
  warnings.push(...parsed.flatMap(feature => feature.metadataWarnings))
  const unresolvedSteps = features.reduce(
    (count, feature) => count + feature.scenarios.reduce((sum, scenario) => sum + scenario.steps.length, 0),
    0,
  )
  if (unresolvedSteps) warnings.push(`${unresolvedSteps} legacy steps require explicit action-catalog mapping.`)
  if (locators.length) warnings.push(`${locators.length} legacy locators require explicit locator-graph mapping.`)
  if (!features.length) warnings.push('No legacy feature files were found.')

  const sourceHash = digest(canonicalContractJson(sources))
  const proposalWithoutHash = {
    schemaVersion: '1' as const,
    kind: 'legacy-automation-import-proposal' as const,
    reviewStatus: 'human-review-required' as const,
    mutationPerformed: false as const,
    sourceRoot: 'automation' as const,
    sourceHash,
    sources,
    features,
    stepDefinitions,
    locators,
    warnings: warnings.slice(0, MAX_WARNINGS),
  }
  return legacyAutomationImportProposalSchema.parse({
    ...proposalWithoutHash,
    proposalHash: digest(canonicalContractJson(proposalWithoutHash)),
  })
}
