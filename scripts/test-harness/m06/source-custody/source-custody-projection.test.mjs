// Static projection only: no packet, client, setup, owner or database launch.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'
import {
  projectSourcePacketScript,
  sourcePacketCommonImportMap,
  sourcePacketImportSites,
  sourcePacketImportSite,
} from './build-source-custody.mjs'

test('all five common mappings replace actual import literals only and preserve the full inverse', () => {
  assert.equal(Object.keys(sourcePacketCommonImportMap).length, 5)
  const comment = "// import '../fixture-terminal-codecs.mjs'\n",
    ordinary = 'const label = "../fixture-terminal-codecs.mjs"\n',
    source =
      comment +
      ordinary +
      Object.keys(sourcePacketCommonImportMap)
        .map(name => `import '${name}'\n`)
        .join('')
  const projected = projectSourcePacketScript(source, 'helper.mjs')
  assert(projected.content.startsWith(comment + ordinary))
  assert.equal(projected.replacements.length, 5)
  assert.equal(projected.importLiteralSites.length, 5)
  assert.deepEqual(Object.values(projected.occurrenceCounts), [1, 1, 1, 1, 1])
  assert.equal(projected.byteInverse, true)
  for (const [before, after] of Object.entries(sourcePacketCommonImportMap)) {
    assert(source.includes(`import '${before}'`))
    assert(projected.content.includes(`import '${after}'`))
  }
})
for (const name of ['source-custody-owner.mjs', 'source-custody-cleanup-owner.mjs']) {
  test(name + ' projects its single original dynamic stage import', () => {
    const result = projectSourcePacketScript("const original = import('./source-custody-cases.ts')\n", name)
    assert.equal(result.content, "const original = import('./source-stage.mjs')\n")
    assert.equal(result.replacements.length, 1)
    assert.equal(result.replacements[0].kind, 'dynamic-import')
    assert.equal(result.byteInverse, true)
    assert.throws(() => projectSourcePacketScript('', name))
    assert.throws(() =>
      projectSourcePacketScript("import('./source-custody-cases.ts'); import('./source-custody-cases.ts')", name),
    )
  })
}
for (const source of [
  "import '../unreviewed.mjs'",
  "import('./source-custody-cases.ts')",
  'import(variable)',
  "import('../fixture-terminal-codecs.mjs', {})",
  "import '../fixture-terminal-codecs\\u002emjs'",
  'import {',
]) {
  test('refuses an undeclared or ambiguous literal projection: ' + source, () => {
    assert.throws(() => projectSourcePacketScript(source, 'helper.mjs'))
  })
}
test('unchanged local and common sibling imports remain byte exact with zero rewrite counts', () => {
  const source =
    "import { x } from './fixture-terminal-codecs.mjs'\nimport path from 'node:path'\nexport { y } from './local.mjs'\n"
  const result = projectSourcePacketScript(source, 'helper.mjs')
  assert.equal(result.content, source)
  assert.equal(result.replacements.length, 0)
  assert.deepEqual(Object.values(result.occurrenceCounts), [0, 0, 0, 0, 0])
})

test('actual import-site parser preserves literal ranges and leaves inherited property names as external imports', () => {
  const source = '// import "../unique-json.mjs"\nimport "constructor"\nimport { x } from "../unique-json.mjs"\n'
  const sites = sourcePacketImportSites(source, 'helper.mjs')
  assert.equal(sites.length, 2)
  assert.equal(source.slice(sites[1].start, sites[1].end), '"../unique-json.mjs"')
  assert.equal(projectSourcePacketScript(source, 'helper.mjs').content.includes('import "constructor"'), true)
})

for (const [text, kind, specifier] of [
  ["import '../unique-json.mjs'", 'static-import', '../unique-json.mjs'],
  ["export * from './local.mjs'", 'static-export', './local.mjs'],
  ["import('./source-custody-cases.ts')", 'dynamic-import', './source-custody-cases.ts'],
]) {
  test('actual whole import-node grammar: ' + text, () => {
    const parsed = ts.createSourceFile('source-custody-owner.mjs', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const statement = parsed.statements[0]
    const node = ts.isExpressionStatement(statement) ? statement.expression : statement
    const site = sourcePacketImportSite(node, parsed, 'source-custody-owner.mjs')
    assert.equal(site.kind, kind)
    assert.equal(site.specifier, specifier)
    assert.equal(text.slice(site.start, site.end), "'" + specifier + "'")
    assert.equal(
      site.projected,
      sourcePacketCommonImportMap[specifier] ?? (kind === 'dynamic-import' ? './source-stage.mjs' : specifier),
    )
  })
}
test('actual whole import-node grammar ignores nonreferences and refuses computed/extra/foreign owner imports', () => {
  for (const text of [
    'export const value = 1',
    'import(variable)',
    "import('./local.mjs', {})",
    "import('../foreign.mjs')",
    "import('./source-custody-cases.ts')",
  ]) {
    const parsed = ts.createSourceFile('helper.mjs', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const statement = parsed.statements[0]
    const node = ts.isExpressionStatement(statement) ? statement.expression : statement
    if (text.startsWith('export const')) assert.equal(sourcePacketImportSite(node, parsed, 'helper.mjs'), undefined)
    else assert.throws(() => sourcePacketImportSite(node, parsed, 'helper.mjs'))
  }
})
