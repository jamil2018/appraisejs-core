// Product fixture builder only: one AST-checked source resource origin, never a runtime fallback.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
const relativeSupervisor = '../../../../scripts/owned-process-supervisor.mjs'
const digest = text => createHash('sha256').update(text).digest('hex')
function assertOwnedSupervisorDeclaration(resource, sourceFile) {
  const conversion = resource.parent
  assert.ok(ts.isCallExpression(conversion))
  assert.equal(conversion.expression.getText(sourceFile), 'fileURLToPath')
  assert.equal(conversion.arguments.length, 1)
  assert.equal(conversion.arguments[0], resource)
  const declaration = conversion.parent
  assert.ok(ts.isVariableDeclaration(declaration))
  assert.equal(declaration.name.getText(sourceFile), 'supervisorPath')
  assert.equal(declaration.initializer, conversion)
  let scope = declaration.parent
  while (scope && !ts.isFunctionDeclaration(scope)) scope = scope.parent
  assert.ok(scope)
  assert.equal(scope.name.text, 'launchOwnedFixtureChild')
}
function soleOwnedSupervisorOrigin(sourceFile) {
  const origins = []
  function visit(node) {
    if (ts.isMetaProperty(node)) origins.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(origins.length, 1, 'Exactly one real import.meta is required.')
  const meta = origins[0]
  assert.equal(meta.keywordToken, ts.SyntaxKind.ImportKeyword)
  assert.equal(meta.name.text, 'meta')
  const origin = meta.parent
  assert.ok(ts.isPropertyAccessExpression(origin))
  assert.equal(origin.name.text, 'url')
  assert.equal(origin.getText(sourceFile), 'import.meta.url')
  const resource = origin.parent
  assert.ok(ts.isNewExpression(resource))
  assert.equal(resource.expression.getText(sourceFile), 'URL')
  assert.equal(resource.arguments.length, 2)
  assert.equal(resource.arguments[1], origin)
  assert.ok(ts.isStringLiteral(resource.arguments[0]))
  assert.equal(resource.arguments[0].text, relativeSupervisor)
  assertOwnedSupervisorDeclaration(resource, sourceFile)
  return origin
}
export function preserveAnalysisOwnedChildOrigin(sourcePath, source, { ownedChildPath, supervisorPath }) {
  assert.equal(sourcePath, ownedChildPath, 'Only exact canonical owned-child source may be transformed.')
  assert.ok(path.isAbsolute(sourcePath))
  assert.equal(path.resolve(sourcePath), sourcePath)
  const parsed = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  assert.equal(parsed.parseDiagnostics.length, 0)
  const expression = soleOwnedSupervisorOrigin(parsed)
  const originalText = expression.getText(parsed)
  const sourceURL = pathToFileURL(sourcePath).href
  assert.equal(fileURLToPath(new URL(relativeSupervisor, sourceURL)), supervisorPath)
  const replacementText = JSON.stringify(sourceURL)
  const start = expression.getStart(parsed),
    end = expression.end
  const contents = source.slice(0, start) + replacementText + source.slice(end)
  const inverse = contents.slice(0, start) + originalText + contents.slice(start + replacementText.length)
  assert.equal(inverse, source)
  return {
    contents,
    original: source,
    receipt: {
      sourcePath,
      sourceURL,
      supervisorPath,
      originalSha256: digest(source),
      transformedSha256: digest(contents),
      inverseSha256: digest(inverse),
      replacement: { start, end, unit: 'UTF16_CODE_UNITS', originalText, replacementText },
    },
  }
}
export function inspectEmittedAnalysisOwnedChildOrigin(outputs, sourceURL) {
  const sites = []
  for (const { filename, contents } of outputs) {
    const parsed = ts.createSourceFile(filename, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    function visit(node) {
      if (ts.isNewExpression(node) && node.expression.getText(parsed) === 'URL') {
        const first = node.arguments?.[0]
        if (first && ts.isStringLiteral(first) && first.text === relativeSupervisor)
          sites.push({ filename, node, parsed })
      }
      ts.forEachChild(node, visit)
    }
    visit(parsed)
  }
  assert.equal(sites.length, 1, 'Exactly one emitted supervisor resource site is required.')
  const { filename, node, parsed } = sites[0]
  assert.equal(node.arguments.length, 2)
  assert.ok(ts.isStringLiteral(node.arguments[1]))
  assert.equal(node.arguments[1].text, sourceURL)
  return { filename, start: node.getStart(parsed), end: node.end, expression: node.getText(parsed), sourceURL }
}
