import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { z } from 'zod'
import { CUSTOM_EXTENSION_RUNTIME_DECLARATIONS, type CustomExtensionPolicy } from './extension-policy'
import { customActionExtensionProposalSchema, type CustomActionExtensionProposal } from './schemas'

const require = createRequire(import.meta.url)
const FORBIDDEN_GLOBALS = new Set([
  'Bun',
  'Deno',
  'eval',
  'fetch',
  'Function',
  'global',
  'globalThis',
  'module',
  'process',
  'SharedWorker',
  'WebAssembly',
  'Worker',
  'XMLHttpRequest',
])

export type CustomExtensionCompilerPolicy = {
  policy: CustomExtensionPolicy
  cucumberModulePath?: string
}

export type CompiledCustomExtension = {
  schemaVersion: '1'
  projectId: string
  projectFingerprint: string
  extension: Pick<CustomActionExtensionProposal, 'id' | 'version' | 'title' | 'description' | 'inputs' | 'outputs'>
  requiredCapabilities: string[]
  imports: Array<{ requested: string; compiled: string }>
  source: string
  compiledSource: string
  sourceHash: string
  compiledHash: string
  cucumberModulePath: string
}

const reviewHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
export const compiledCustomExtensionSchema = z.object({
  schemaVersion: z.literal('1'),
  projectId: z.string().min(1).max(80),
  projectFingerprint: reviewHashSchema,
  extension: z.object({
    id: z.string().min(1).max(80),
    version: z.string().regex(/^\d+(?:\.\d+){0,2}$/),
    title: z.string().min(1).max(2_000),
    description: z.string().min(1).max(2_000),
    inputs: z
      .array(
        z.object({
          name: z.string().min(1).max(80),
          type: z.enum(['string', 'number', 'boolean', 'locator', 'json']),
          required: z.boolean(),
        }),
      )
      .max(32),
    outputs: z
      .array(
        z.object({
          name: z.string().min(1).max(80),
          type: z.enum(['string', 'number', 'boolean', 'locator', 'json']),
        }),
      )
      .max(32),
  }),
  requiredCapabilities: z.array(z.string().min(1).max(80)).max(16),
  imports: z.array(z.object({ requested: z.string().max(500), compiled: z.string().max(2_000) })).max(32),
  source: z.string().max(65_536),
  compiledSource: z.string().max(262_144),
  sourceHash: reviewHashSchema,
  compiledHash: reviewHashSchema,
  cucumberModulePath: z.string().min(1).max(2_000),
})

export class CustomExtensionCompilationError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(message)
    this.name = 'CustomExtensionCompilationError'
  }
}

const hash = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`

function resolveCucumberModulePath() {
  return resolve(dirname(require.resolve('@cucumber/cucumber')), '../lib/index.js')
}

function collectAndValidateImports(
  sourceFile: ts.SourceFile,
  proposal: CustomActionExtensionProposal,
  policy: CustomExtensionCompilerPolicy,
  cucumberModulePath: string,
) {
  const issues: string[] = []
  const capabilities = new Set(proposal.requiredCapabilities)
  const unknownCapabilities = [...capabilities].filter(capability => !(capability in policy.policy.capabilityImports))
  issues.push(...unknownCapabilities.map(capability => `Capability "${capability}" is not allowed for this project.`))
  const allowedImports = new Set(
    [...capabilities].flatMap(capability => policy.policy.capabilityImports[capability] ?? []),
  )
  const imports: Array<{ requested: string; compiled: string }> = []

  const inspect = (node: ts.Node) => {
    inspectImportDeclaration(node, allowedImports, cucumberModulePath, imports, issues)
    inspectCall(node, issues)
    inspectImportMeta(node, issues)
    if (isForbiddenGlobalReference(node)) issues.push(`Global "${node.text}" is not allowed.`)
    inspectModuleReExport(node, issues)
    ts.forEachChild(node, inspect)
  }
  inspect(sourceFile)
  return { issues, imports }
}

function inspectImportDeclaration(
  node: ts.Node,
  allowedImports: Set<string>,
  cucumberModulePath: string,
  imports: Array<{ requested: string; compiled: string }>,
  issues: string[],
) {
  if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return
  const requested = node.moduleSpecifier.text
  if (requested === '@cucumber/cucumber') imports.push({ requested, compiled: cucumberModulePath })
  else if (allowedImports.has(requested)) imports.push({ requested, compiled: requested })
  else issues.push(`Import "${requested}" is not allowed by the declared capabilities.`)
}

function inspectImportMeta(node: ts.Node, issues: string[]) {
  if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword)
    issues.push('import.meta is not allowed.')
}

function inspectModuleReExport(node: ts.Node, issues: string[]) {
  if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
    issues.push('Module re-exports are not allowed.')
}

function inspectCall(node: ts.Node, issues: string[]) {
  if (!ts.isCallExpression(node)) return
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) issues.push('Dynamic imports are not allowed.')
  if (ts.isIdentifier(node.expression) && node.expression.text === 'require')
    issues.push('CommonJS require is not allowed.')
}

function isForbiddenGlobalReference(node: ts.Node): node is ts.Identifier {
  if (!ts.isIdentifier(node) || !FORBIDDEN_GLOBALS.has(node.text)) return false
  if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) return false
  return !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)
}

function typeCheck(source: string, fileName: string) {
  const virtualPath = resolve(process.cwd(), '.appraise-extension-compiler', fileName)
  const declarationsPath = resolve(process.cwd(), '.appraise-extension-compiler', 'allowed-modules.d.ts')
  const declarations = CUSTOM_EXTENSION_RUNTIME_DECLARATIONS
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    noLib: true,
    types: [],
    typeRoots: [],
  }
  const files = new Map([
    [virtualPath, source],
    [declarationsPath, declarations],
  ])
  const host = ts.createCompilerHost(options)
  host.fileExists = path => files.has(path)
  host.readFile = path => files.get(path)
  host.getSourceFile = (path, languageVersion) => {
    const content = files.get(path)
    return content === undefined ? undefined : ts.createSourceFile(path, content, languageVersion, true)
  }
  return ts
    .getPreEmitDiagnostics(ts.createProgram([virtualPath, declarationsPath], options, host))
    .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error && diagnostic.code !== 2318)
    .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
}

function bindCucumberImport(sourceFile: ts.SourceFile, cucumberModulePath: string) {
  const transformer: ts.TransformerFactory<ts.SourceFile> = context => root => {
    const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === '@cucumber/cucumber'
      ) {
        return ts.factory.updateImportDeclaration(
          node,
          node.modifiers,
          node.importClause,
          ts.factory.createStringLiteral(cucumberModulePath),
          node.attributes,
        )
      }
      return ts.visitEachChild(node, visitor, context)
    }
    return ts.visitNode(root, visitor) as ts.SourceFile
  }
  return ts.transform(sourceFile, [transformer]).transformed[0]
}

export function compileCustomExtension(
  input: CustomActionExtensionProposal,
  policy: CustomExtensionCompilerPolicy,
): CompiledCustomExtension {
  const proposal = customActionExtensionProposalSchema.parse(input)
  const cucumberModulePath = policy.cucumberModulePath ?? resolveCucumberModulePath()
  const sourceFile = ts.createSourceFile(
    `${proposal.id}.mts`,
    proposal.implementation.source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  )
  const parseIssues = (
    sourceFile as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }
  ).parseDiagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
  const validation = collectAndValidateImports(sourceFile, proposal, policy, cucumberModulePath)
  if (parseIssues.length || validation.issues.length)
    throw new CustomExtensionCompilationError('Custom extension compilation rejected.', [
      ...parseIssues,
      ...validation.issues,
    ])
  const issues = [...typeCheck(proposal.implementation.source, `${proposal.id}.mts`)]
  if (issues.length) throw new CustomExtensionCompilationError('Custom extension compilation rejected.', issues)

  const boundSource = ts
    .createPrinter({ newLine: ts.NewLineKind.LineFeed })
    .printFile(bindCucumberImport(sourceFile, cucumberModulePath))
  const compilation = ts.transpileModule(boundSource, {
    fileName: `${proposal.id}.mts`,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      isolatedModules: true,
      sourceMap: false,
    },
  })
  const compilationIssues = (compilation.diagnostics ?? [])
    .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)
    .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
  if (compilationIssues.length) {
    throw new CustomExtensionCompilationError('Custom extension TypeScript compilation failed.', compilationIssues)
  }

  return {
    schemaVersion: '1',
    projectId: policy.policy.projectId,
    projectFingerprint: policy.policy.projectFingerprint,
    extension: {
      id: proposal.id,
      version: proposal.version,
      title: proposal.title,
      description: proposal.description,
      inputs: proposal.inputs,
      outputs: proposal.outputs,
    },
    requiredCapabilities: [...proposal.requiredCapabilities].sort(),
    imports: validation.imports,
    source: proposal.implementation.source,
    compiledSource: compilation.outputText,
    sourceHash: hash(proposal.implementation.source),
    compiledHash: hash(compilation.outputText),
    cucumberModulePath,
  }
}
