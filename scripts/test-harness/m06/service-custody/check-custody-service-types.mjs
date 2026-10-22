// Static TypeScript program with the SAME importer-specific resolution as the bundle. No product module imports.
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { legacyResolution } from './custody-legacy-resolution.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const require = createRequire(path.join(root, 'package.json'))
const ts = require('typescript')
const generated = path.resolve(process.argv[2] ?? require.resolve('@prisma/client').replace(/\.js$/, '.d.ts'))
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile)
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
const options = {
  ...parsed.options,
  incremental: false,
  noEmit: true,
  allowNonTsExtensions: true,
  checkJs: true,
  baseUrl: root,
  paths: { '@/*': ['./src/*'], '@prisma/client': [generated] },
}
const host = ts.createCompilerHost(options)
const legacy = legacyResolution(root)
const getSourceFile = host.getSourceFile.bind(host)
host.getSourceFile = (filename, languageVersion, onError, shouldCreateNewSourceFile) =>
  filename.endsWith('.fixture')
    ? ts.createSourceFile(filename, host.readFile(filename) ?? '', languageVersion, true, ts.ScriptKind.TS)
    : getSourceFile(filename, languageVersion, onError, shouldCreateNewSourceFile)
const moduleEdges = new Map()
host.resolveModuleNames = (specifiers, containingFile) =>
  specifiers.map(specifier => {
    const exact = legacy.resolve(containingFile, specifier) ?? specifier
    const resolved = exact.endsWith('.fixture')
      ? { resolvedFileName: exact, extension: ts.Extension.Ts }
      : ts.resolveModuleName(exact, containingFile, options, host).resolvedModule
    moduleEdges.set(containingFile + '\0' + specifier, {
      importer: containingFile,
      specifier,
      target: resolved?.resolvedFileName,
    })
    return resolved
  })
const files = [
  'src/services/coordinator/quality-journey-provider-run-service.ts',
  'src/services/coordinator/quality-journey-outcome-source.sqlite.integration.test.ts',
  'scripts/test-harness/m06/service-custody/custody-service-owner.ts',
  'scripts/test-harness/m06/service-custody/custody-legacy-entry.mjs',
  'scripts/test-harness/m06/service-custody/custody-service-controller.mjs',
  'scripts/test-harness/m06/service-custody/custody-service-composition-controller.mjs',
]
const commonDeclarations = [
  'fixture-terminal-codecs',
  'fixture-evidence-read',
  'fixture-diagnostic-failures',
  'unique-json',
  'fixture-audit-records',
].map(name => path.join(root, 'scripts/test-harness/m06', name + '.d.mts'))
const program = ts.createProgram([...files.map(file => path.join(root, file)), ...commonDeclarations], options, host)
const historicalSources = program.getSourceFiles().filter(file => file.fileName.startsWith(legacy.legacy + path.sep))
if (
  historicalSources.length !== Object.keys(legacy.expected).length ||
  historicalSources.some(file => file.scriptKind !== ts.ScriptKind.TS)
)
  throw new Error('Strict checker did not parse exactly seven original TypeScript bodies')
const diagnostics = ts.getPreEmitDiagnostics(program)
process.stdout.write(
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  }),
)
process.stdout.write(
  JSON.stringify({
    target: ts.ScriptTarget[options.target],
    generatedDeclaration: generated,
    compilerOptions: options,
    roots: program.getRootFileNames(),
    typeInputs: program.getSourceFiles().map(file => ({
      filename: file.fileName,
      declaration: file.isDeclarationFile,
      bytes: Buffer.byteLength(readFileSync(file.fileName)),
      sha256: createHash('sha256').update(readFileSync(file.fileName)).digest('hex'),
    })),
    sourceGraph: program
      .getSourceFiles()
      .filter(file => file.fileName.startsWith(root + path.sep) || file.fileName === generated)
      .map(file => ({
        filename: file.fileName,
        declaration: file.isDeclarationFile,
        sha256: createHash('sha256').update(readFileSync(file.fileName)).digest('hex'),
      })),
    moduleEdges: [...moduleEdges.values()],
    originalBodies: legacy.expected,
    historicalSources: historicalSources.map(file => ({
      filename: file.fileName,
      scriptKind: ts.ScriptKind[file.scriptKind],
    })),
    importEdges: legacy.edges(),
    diagnostics: diagnostics.length,
  }) + '\n',
)
process.exitCode = diagnostics.length ? 1 : 0
