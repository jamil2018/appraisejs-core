import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import ts from 'typescript'
import { z } from 'zod'

import type { PrismaClient } from '@prisma/client'
import {
  canonicalStepDefinitionJson,
  stepDefinitionContentHash,
  stepDefinitionSchema,
  type StepDefinition,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'
import { generateStepDefinitionContract } from '../../../packages/cucumber-runtime/src/step-definitions/artifact-contract.ts'
import { ServiceError } from '@/services/shared/errors'

const MAX_SOURCE_BYTES = 65_536
const EXAMPLE_TIMEOUT_MS = 1_000
const forbiddenGlobals = new Set([
  'Bun',
  'Deno',
  'eval',
  'fetch',
  'Function',
  'global',
  'globalThis',
  'module',
  'process',
  'require',
  'WebAssembly',
  'Worker',
  'XMLHttpRequest',
])

const stepDefinitionArtifactInputSchema = z.object({
  handlerSource: z
    .string()
    .min(1)
    .refine(value => Buffer.byteLength(value) <= MAX_SOURCE_BYTES, 'Source is too large.'),
  examples: z.array(z.object({ name: z.string().min(1).max(200), inputs: z.record(z.string(), z.unknown()) })).max(20),
})

const runtimeCapabilityImports: Record<string, readonly string[]> = {
  browser: ['@playwright/test'],
  api: [],
  node: [],
  database: [],
}

export { generateStepDefinitionContract }

export function generateStepDefinitionHandlerBoilerplate(definition: StepDefinition) {
  const outputs = definition.outputs.map(output => `${output.name}: undefined as never`).join(', ')
  return [
    "import type { StepHandler } from './contract.js'",
    '',
    'export const handler: StepHandler = async (input, context) => {',
    '  void input',
    '  context.signal.throwIfAborted()',
    '  // Implement the reviewed behavior here.',
    `  return { ${outputs} }`,
    '}',
    '',
  ].join('\n')
}

function inspectSource(source: string, runtime: string) {
  const sourceFile = ts.createSourceFile('handler.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const issues: string[] = []
  const allowedImports = new Set(['./contract.js', ...(runtimeCapabilityImports[runtime] ?? [])])
  const importIssue = (node: ts.Node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return null
    return allowedImports.has(node.moduleSpecifier.text)
      ? null
      : `Import "${node.moduleSpecifier.text}" is not allowed by the declared runtime.`
  }
  const globalIssue = (node: ts.Node) => {
    if (!ts.isIdentifier(node) || !forbiddenGlobals.has(node.text)) return null
    if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) return null
    return `Global "${node.text}" is not allowed.`
  }
  const inspectNode = (node: ts.Node) =>
    [
      importIssue(node),
      ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        ? 'Dynamic imports are not allowed.'
        : null,
      ts.isMetaProperty(node) ? 'import.meta is not allowed.' : null,
      globalIssue(node),
    ].filter((issue): issue is string => Boolean(issue))
  const visit = (node: ts.Node) => {
    issues.push(...inspectNode(node))
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return { sourceFile, issues: [...new Set(issues)] }
}

function compileSource(source: string, runtime: string) {
  const inspected = inspectSource(source, runtime)
  if (inspected.issues.length) return { compiledSource: null, diagnostics: inspected.issues }
  const result = ts.transpileModule(source, {
    fileName: 'handler.ts',
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      isolatedModules: true,
      sourceMap: false,
    },
  })
  const diagnostics = (result.diagnostics ?? [])
    .filter(item => item.category === ts.DiagnosticCategory.Error)
    .map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n'))
  return { compiledSource: diagnostics.length ? null : result.outputText, diagnostics }
}

function artifactManifest(definition: StepDefinition, sourceHash: string, contractHash: string) {
  if (definition.execution.kind !== 'reviewed-extension')
    throw new ServiceError('A reviewed-extension binding is required.', 'VALIDATION')
  return {
    schemaVersion: '1',
    extension: { id: definition.execution.extensionId, version: definition.execution.extensionVersion },
    exportName: definition.execution.exportName,
    runtime: definition.execution.runtime,
    capabilities: [...definition.intent.capabilities].sort(),
    sourceHash,
    contractHash,
  }
}

function containedDraftDirectory(root: string, draftId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(draftId)) throw new ServiceError('Draft ID is not safe for staging.', 'VALIDATION')
  const directory = path.resolve(root, draftId)
  const containedRoot = `${path.resolve(root)}${path.sep}`
  if (!directory.startsWith(containedRoot)) throw new ServiceError('Draft staging path escaped its root.', 'VALIDATION')
  return directory
}

async function stageArtifact(root: string, draftId: string, files: Record<string, string>) {
  const directory = containedDraftDirectory(root, draftId)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await Promise.all(
    Object.entries(files).map(([name, contents]) => writeFile(path.join(directory, name), contents, { mode: 0o600 })),
  )
  return directory
}

function matchesOutputType(value: unknown, type: StepDefinition['outputs'][number]['type']) {
  if (type === 'json') return true
  if (type === 'number') return typeof value === 'number'
  if (type === 'boolean') return typeof value === 'boolean'
  return typeof value === 'string'
}

async function runExample(
  compiledSource: string,
  definition: StepDefinition,
  example: { name: string; inputs: Record<string, unknown> },
  signal?: AbortSignal,
) {
  const workerSource = `
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      try {
        const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(workerData.source).toString('base64');
        const loaded = await import(moduleUrl);
        const controller = new AbortController();
        const handler = loaded.handler ?? loaded.default?.handler;
        if (typeof handler !== 'function') throw new Error('Compiled artifact does not export handler.');
        const output = await handler(workerData.inputs, { runtime: workerData.runtime, signal: controller.signal });
        parentPort.postMessage({ ok: true, output });
      } catch (error) {
        parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
  `
  return new Promise<{ name: string; passed: boolean; error?: string }>(resolve => {
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: {
        source: compiledSource,
        inputs: example.inputs,
        runtime: definition.execution.kind === 'reviewed-extension' ? definition.execution.runtime : 'node',
      },
    })
    let settled = false
    const finish = (result: { name: string; passed: boolean; error?: string }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      void worker.terminate()
      resolve(result)
    }
    const timer = setTimeout(
      () => finish({ name: example.name, passed: false, error: `Timed out after ${EXAMPLE_TIMEOUT_MS}ms.` }),
      EXAMPLE_TIMEOUT_MS,
    )
    if (signal?.aborted) return finish({ name: example.name, passed: false, error: 'Conformance was cancelled.' })
    signal?.addEventListener(
      'abort',
      () => finish({ name: example.name, passed: false, error: 'Conformance was cancelled.' }),
      { once: true },
    )
    worker.once('error', error => finish({ name: example.name, passed: false, error: error.message }))
    worker.once('message', result => {
      if (!result.ok) return finish({ name: example.name, passed: false, error: result.error })
      const output = result.output as Record<string, unknown> | null
      const valid =
        Boolean(output) && definition.outputs.every(item => matchesOutputType(output?.[item.name], item.type))
      finish({ name: example.name, passed: valid, error: valid ? undefined : 'Output does not match the contract.' })
    })
  })
}

type CompileResult = ReturnType<typeof compileSource>
type DraftExample = { name: string; inputs: Record<string, unknown> }
type ExampleResult = Awaited<ReturnType<typeof runExample>>

function conformanceEvidence(result: CompileResult, examples: DraftExample[], exampleResults: ExampleResult[]) {
  const hasExamples = examples.length > 0
  const examplesPassed = exampleResults.every(example => example.passed)
  return {
    passed: Boolean(result.compiledSource) && hasExamples && examplesPassed,
    checks: [
      { id: 'static-policy', passed: result.diagnostics.length === 0 },
      { id: 'typescript-compile', passed: Boolean(result.compiledSource) },
      { id: 'explicit-examples', passed: hasExamples },
      { id: 'behavioral-examples', passed: hasExamples && examplesPassed, examples: exampleResults },
    ],
  }
}

async function executeExamples(
  compiledSource: string | null,
  definition: StepDefinition,
  examples: DraftExample[],
  signal?: AbortSignal,
) {
  if (!compiledSource) return []
  return Promise.all(examples.map(example => runExample(compiledSource, definition, example, signal)))
}

export class StepDefinitionExtensionService {
  constructor(
    private readonly database: PrismaClient,
    private readonly stagingRoot = path.join(process.cwd(), '.appraise', 'step-definitions', 'drafts'),
  ) {}

  async saveDraftArtifact(draftId: string, expectedRevision: number, value: unknown) {
    const input = stepDefinitionArtifactInputSchema.parse(value)
    const draft = await this.database.stepDefinitionDraft.findUnique({ where: { id: draftId } })
    if (!draft) throw new ServiceError(`Step Definition draft ${draftId} was not found.`, 'NOT_FOUND')
    if (draft.revision !== expectedRevision)
      throw new ServiceError(`Step Definition draft ${draftId} revision is stale.`, 'CONFLICT')
    const definition = stepDefinitionSchema.parse(JSON.parse(draft.draftJson))
    const contractSource = generateStepDefinitionContract(definition)
    const sourceHash = stepDefinitionContentHash(input.handlerSource)
    const manifest = artifactManifest(definition, sourceHash, stepDefinitionContentHash(contractSource))
    await stageArtifact(this.stagingRoot, draftId, {
      'definition.json': canonicalStepDefinitionJson(definition),
      'contract.ts': contractSource,
      'handler.ts': input.handlerSource,
      'examples.json': canonicalStepDefinitionJson(input.examples),
      'manifest.json': canonicalStepDefinitionJson(manifest),
    })
    return this.database.stepDefinitionDraftArtifact.upsert({
      where: { draftId },
      create: {
        draftId,
        contractSource,
        handlerSource: input.handlerSource,
        examplesJson: canonicalStepDefinitionJson(input.examples),
        manifestJson: canonicalStepDefinitionJson(manifest),
        sourceHash,
      },
      update: {
        contractSource,
        handlerSource: input.handlerSource,
        examplesJson: canonicalStepDefinitionJson(input.examples),
        manifestJson: canonicalStepDefinitionJson(manifest),
        sourceHash,
        compiledSource: null,
        compiledHash: null,
        diagnosticsJson: null,
        conformanceJson: null,
        conformanceHash: null,
        reviewedArtifactHash: null,
      },
    })
  }

  async compileDraftArtifact(draftId: string, expectedRevision: number, signal?: AbortSignal) {
    const artifact = await this.database.stepDefinitionDraftArtifact.findUnique({
      where: { draftId },
      include: { draft: true },
    })
    if (!artifact) throw new ServiceError('Handler source has not been saved.', 'VALIDATION')
    if (artifact.draft.revision !== expectedRevision)
      throw new ServiceError(`Step Definition draft ${draftId} revision is stale.`, 'CONFLICT')
    const definition = stepDefinitionSchema.parse(JSON.parse(artifact.draft.draftJson))
    if (definition.execution.kind !== 'reviewed-extension')
      throw new ServiceError('A reviewed-extension binding is required.', 'VALIDATION')
    const result = compileSource(artifact.handlerSource, definition.execution.runtime)
    const compiledHash = result.compiledSource ? stepDefinitionContentHash(result.compiledSource) : null
    const examples = JSON.parse(artifact.examplesJson) as DraftExample[]
    const exampleResults = await executeExamples(result.compiledSource, definition, examples, signal)
    if (result.compiledSource) await stageArtifact(this.stagingRoot, draftId, { 'handler.mjs': result.compiledSource })
    const conformance = conformanceEvidence(result, examples, exampleResults)
    const conformanceHash = stepDefinitionContentHash(conformance)
    const updated = await this.database.stepDefinitionDraftArtifact.update({
      where: { draftId },
      data: {
        compiledSource: result.compiledSource,
        compiledHash,
        diagnosticsJson: canonicalStepDefinitionJson(result.diagnostics),
        conformanceJson: canonicalStepDefinitionJson(conformance),
        conformanceHash,
      },
    })
    let revision = artifact.draft.revision
    if (compiledHash) {
      const boundDefinition = {
        ...definition,
        execution: { ...definition.execution, sourceHash: artifact.sourceHash, compiledHash },
      }
      const boundJson = canonicalStepDefinitionJson(boundDefinition)
      await this.database.stepDefinitionDraft.update({
        where: { id: draftId },
        data: {
          draftJson: boundJson,
          draftHash: stepDefinitionContentHash(boundDefinition),
          revision: { increment: 1 },
          validationReportJson: null,
          reviewedDraftHash: null,
          reviewedBy: null,
          reviewedAt: null,
        },
      })
      revision += 1
    }
    return { ...updated, revision, diagnostics: result.diagnostics, conformance }
  }

  async readDraftArtifact(draftId: string) {
    const artifact = await this.database.stepDefinitionDraftArtifact.findUnique({ where: { draftId } })
    if (!artifact) return null
    return {
      ...artifact,
      examples: JSON.parse(artifact.examplesJson),
      manifest: JSON.parse(artifact.manifestJson),
      diagnostics: artifact.diagnosticsJson ? JSON.parse(artifact.diagnosticsJson) : [],
      conformance: artifact.conformanceJson ? JSON.parse(artifact.conformanceJson) : null,
    }
  }

  async revokeReviewedExtension(input: { id: string; version: string; revokedBy: string; reason: string }) {
    const { id, version } = input
    const revokedBy = z.string().trim().min(1).max(200).parse(input.revokedBy)
    const reason = z.string().trim().min(1).max(2_000).parse(input.reason)
    const updated = await this.database.stepReviewedExtension.updateMany({
      where: { id, version, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy, revocationReason: reason },
    })
    if (updated.count === 0) throw new ServiceError('Reviewed extension was not found or is already revoked.', 'NOT_FOUND')
    return this.database.stepReviewedExtension.findUniqueOrThrow({ where: { id_version: { id, version } } })
  }

  static artifactHash(value: {
    sourceHash: string
    compiledHash: string
    conformanceHash: string
    manifestJson: string
  }) {
    return `sha256:${createHash('sha256').update(canonicalStepDefinitionJson(value)).digest('hex')}`
  }
}
