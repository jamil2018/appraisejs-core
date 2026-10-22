// Static source/URL adaptation only. Never imports or evaluates the owned-child source or emitted bundles.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const ts = createRequire(import.meta.url)('typescript')
const resource = '../../../../scripts/owned-process-supervisor.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')

function sourceOriginExpression(source, filename) {
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  assert.equal(parsed.parseDiagnostics.length, 0, 'Owned-child source must parse exactly')
  const uses = []
  function visit(node) {
    if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) uses.push(node)
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  assert.equal(uses.length, 1, 'Expected exactly one original import.meta use')
  const expression = uses[0].parent
  assert.ok(ts.isPropertyAccessExpression(expression) && expression.name.text === 'url')
  assert.equal(expression.getText(parsed), 'import.meta.url')
  const url = expression.parent
  assert.ok(ts.isNewExpression(url) && ts.isIdentifier(url.expression) && url.expression.text === 'URL')
  assert.equal(url.arguments?.length, 2)
  assert.equal(url.arguments[1], expression)
  assert.ok(ts.isStringLiteral(url.arguments[0]) && url.arguments[0].text === resource)
  const decode = url.parent
  assert.ok(
    ts.isCallExpression(decode) && ts.isIdentifier(decode.expression) && decode.expression.text === 'fileURLToPath',
  )
  assert.equal(decode.arguments.length, 1)
  assert.equal(decode.arguments[0], url)
  assert.ok(ts.isVariableDeclaration(decode.parent) && decode.parent.name.getText(parsed) === 'supervisorPath')
  return { start: expression.getStart(parsed), end: expression.end, original: expression.getText(parsed) }
}

export function preserveServiceOwnedChildOrigin(filename, source) {
  assert.ok(path.isAbsolute(filename))
  const replacement = sourceOriginExpression(source, filename)
  const originalURL = pathToFileURL(filename).href
  const literal = JSON.stringify(originalURL)
  const transformed = source.slice(0, replacement.start) + literal + source.slice(replacement.end)
  const inverse =
    transformed.slice(0, replacement.start) +
    replacement.original +
    transformed.slice(replacement.start + literal.length)
  assert.equal(inverse, source, 'Exact one-expression inverse must recover original bytes')
  const supervisor = fileURLToPath(new URL(resource, originalURL))
  const canonicalSupervisor = path.resolve(path.dirname(filename), resource)
  assert.equal(supervisor, canonicalSupervisor)
  return {
    source,
    transformed,
    inverse,
    receipt: {
      filename,
      sourceSha256: hash(source),
      transformedSha256: hash(transformed),
      inverseSha256: hash(inverse),
      sourceBytes: Buffer.byteLength(source),
      transformedBytes: Buffer.byteLength(transformed),
      replacement: { ...replacement, literal },
      originalURL,
      relativeResource: resource,
      supervisor,
      loader: 'ts',
      resolveDir: path.dirname(filename),
      inverseByteIdentical: true,
    },
  }
}

function emittedURLConstructors(parsed) {
  const constructors = []
  function visit(node) {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL')
      constructors.push(node)
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return constructors
}

export function assertServiceOwnedChildEmittedOrigin(filename, source, origin) {
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  assert.equal(parsed.parseDiagnostics.length, 0, 'Emitted owned-child bundle must parse')
  const sites = []
  for (const node of emittedURLConstructors(parsed)) {
    if (node.arguments?.length !== 2) continue
    if (!ts.isStringLiteral(node.arguments[0]) || node.arguments[0].text !== resource) continue
    const decode = node.parent
    assert.ok(
      ts.isCallExpression(decode) && ts.isIdentifier(decode.expression) && decode.expression.text === 'fileURLToPath',
    )
    assert.ok(ts.isVariableDeclaration(decode.parent) && decode.parent.name.getText(parsed) === 'supervisorPath')
    assert.ok(ts.isStringLiteral(node.arguments[1]), 'Launch resource must use the literal original module URL')
    assert.equal(node.arguments[1].text, origin.originalURL)
    sites.push({ start: node.getStart(parsed), end: node.end, expression: node.getText(parsed) })
  }
  assert.equal(sites.length, 1, 'Affected bundle requires exactly one original owned-child launch resource site')
  const incorrectOutputRelative = fileURLToPath(new URL(resource, pathToFileURL(filename)))
  assert.notEqual(incorrectOutputRelative, origin.supervisor)
  return {
    filename,
    bundleSha256: hash(source),
    sites,
    effectiveSupervisor: origin.supervisor,
    incorrectOutputRelative,
  }
}
