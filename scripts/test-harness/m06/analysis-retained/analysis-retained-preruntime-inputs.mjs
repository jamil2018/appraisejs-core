import assert from 'node:assert/strict'
import path from 'node:path'
/** Inspect all statically evaluated emitted descendants; dynamic product imports remain behind admission. */
export function inspectAnalysisPreRuntimeClosure(metafile, entry, { root, sourceEntry }) {
  const preRuntimeOutputs = new Set()
  function inspectPreRuntimeOutput(name) {
    if (preRuntimeOutputs.has(name)) return
    preRuntimeOutputs.add(name)
    const emittedModule = metafile.outputs[name]
    assert.ok(emittedModule)
    const permittedSources = new Set([
      path.relative(root, sourceEntry),
      'src/test/m06-analysis-retained-lifetime.ts',
      'scripts/test-harness/m06/unique-json.mjs',
      'scripts/test-harness/m06/source-custody/source-custody-client-binding.mjs',
    ])
    for (const input of Object.keys(emittedModule.inputs))
      assert.ok(permittedSources.has(input), 'Product input before admission: ' + input)
    for (const dependency of emittedModule.imports) {
      if (dependency.kind === 'dynamic-import') continue
      if (dependency.external)
        assert.ok(
          dependency.path.startsWith('node:') || dependency.path === 'zod',
          'Runtime dependency before admission: ' + dependency.path,
        )
      else inspectPreRuntimeOutput(dependency.path)
    }
  }
  inspectPreRuntimeOutput(path.relative(root, entry.filename))
  return preRuntimeOutputs
}
