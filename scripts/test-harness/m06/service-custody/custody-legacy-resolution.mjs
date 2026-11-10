// Static importer-specific resolution only. Never imports a historical product module.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
export function legacyResolution(root) {
  const legacy = realpathSync(path.join(root, 'scripts/test-harness/m06/service-custody/legacy-fixtures'))
  const entries = {
    './legacy-fixtures/src/lib/quality-journey/codex-app-server/outcome-source.ts.fixture':
      'src/lib/quality-journey/codex-app-server/outcome-source.ts',
    './legacy-fixtures/src/lib/quality-journey/codex-app-server/outcome-source-contract.ts.fixture':
      'src/lib/quality-journey/codex-app-server/outcome-source-contract.ts',
    './legacy-fixtures/src/lib/quality-journey/provider-reconciliation-contract.ts.fixture':
      'src/lib/quality-journey/provider-reconciliation-contract.ts',
    './legacy-fixtures/src/services/coordinator/quality-journey-provider-run-service.ts.fixture':
      'src/services/coordinator/quality-journey-provider-run-service.ts',
  }
  const expected = {
    'src/lib/quality-journey/codex-app-server/outcome-source.ts':
      '009d0161e1156d98f65260d22419e854211711cba9415f3eee34bafaeccdbdbb',
    'src/lib/quality-journey/codex-app-server/outcome-custodian.ts':
      '1c08b109367423d38a6255a728c4b911da6a32dd3f3f870f327b658a824887ae',
    'src/lib/quality-journey/codex-app-server/outcome-source-journal.ts':
      '150cd3027e417533af0bef82c25a328a086a545f59ed82c38508b5baba32b607',
    'src/lib/quality-journey/codex-app-server/outcome-source-contract.ts':
      'b9db4ad8dfad5a4785ec89f28809a8bc13d101cb4d985188fa4beda6c5fb05b0',
    'src/lib/quality-journey/codex-app-server/outcome-source-envelope.ts':
      'afefab966ee09397e9169e7515beaa3231dbe4327961ab073da1337339efa61f',
    'src/lib/quality-journey/provider-reconciliation-contract.ts':
      'a47778c722a27996788a8315811137937143a652faf6735df417c67a55fdbc33',
    'src/services/coordinator/quality-journey-provider-run-service.ts':
      'b279f3d77ac64c34228dd7122e87c7d29559f887acd3421ed50d4dc7ce89122b',
  }
  for (const [relative, sha256] of Object.entries(expected))
    if (
      createHash('sha256')
        .update(readFileSync(path.join(legacy, relative + '.fixture')))
        .digest('hex') !== sha256
    )
      throw new Error('Original legacy body changed: ' + relative)
  const edges = new Map()
  function isCanonicalAuthorityRelative(relative) {
    return (
      relative.endsWith('/provider-intent-contract.ts') ||
      relative.endsWith('/rpc-transport.ts') ||
      relative.startsWith('src/services/coordinator/quality-journey-')
    )
  }
  function resolveOriginalRelative(importer, specifier) {
    const original = path.resolve(path.dirname(importer), specifier) + '.ts'
    const relative = path.relative(legacy, original)
    if (isCanonicalAuthorityRelative(relative)) return path.join(root, relative)
    else if (Object.hasOwn(expected, relative)) return original + '.fixture'
    else throw new Error('Unreviewed legacy relative import: ' + importer + ' -> ' + specifier)
  }
  function isOriginalServiceValidator(importer, specifier) {
    return (
      importer ===
        path.join(
          legacy,
          entries['./legacy-fixtures/src/services/coordinator/quality-journey-provider-run-service.ts.fixture'] +
            '.fixture',
        ) && specifier === '@/lib/quality-journey/provider-reconciliation-contract'
    )
  }
  function resolveOriginalImport(importer, specifier) {
    if (isOriginalServiceValidator(importer, specifier))
      return path.join(
        legacy,
        entries['./legacy-fixtures/src/lib/quality-journey/provider-reconciliation-contract.ts.fixture'] + '.fixture',
      )
    else if (specifier.startsWith('@/')) return path.join(root, 'src', specifier.slice(2))
    else if (specifier.startsWith('.')) return resolveOriginalRelative(importer, specifier)
  }
  function selectImportTarget(importer, specifier) {
    let target
    if (specifier === '@/config/db-config')
      target = path.join(root, 'scripts/test-harness/m06/service-custody/custody-owner-ambient-db.ts')
    else if (entries[specifier]) target = path.join(legacy, entries[specifier] + '.fixture')
    else if (importer.startsWith(legacy + path.sep)) target = resolveOriginalImport(importer, specifier)
    return target
  }
  function isUnresolvedModuleStem(target) {
    return target && !target.endsWith('.ts') && !target.endsWith('.fixture')
  }
  function resolveTargetFilename(target) {
    if (isUnresolvedModuleStem(target))
      target = existsSync(target + '.ts') ? target + '.ts' : path.join(target, 'index.ts')
    return target
  }
  function resolve(importer, specifier) {
    let target = selectImportTarget(importer, specifier)
    target = resolveTargetFilename(target)
    if (target) edges.set(importer + '\0' + specifier, { importer, specifier, target })
    return target
  }
  return {
    legacy,
    resolve,
    expected,
    edges: () => [...edges.values()].sort((a, b) => (a.importer + a.specifier).localeCompare(b.importer + b.specifier)),
  }
}
