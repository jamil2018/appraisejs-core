/** Offline compiler only; generated modules are never imported or launched here. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { createRequire, isBuiltin } from 'node:module'
import { build } from 'esbuild'

export async function buildTrustedSupervisor({ revision = 'r3' } = {}) {
  if (!/^r[1-9][0-9]*$/.test(revision)) throw new Error('exact build revision required')
  const directory = resolve(`.appraisejs/m02-t0-build-${revision}`)
  await fs.mkdir(directory, { mode: 0o700 }) // exclusive: an existing build is never overwritten
  await build({
    entryPoints: ['scripts/tests/fixtures/codex-app-server-m02-ta/canonical-bridge.ts'],
    outdir: directory,
    outExtension: { '.js': '.mjs' },
    plugins: [
      {
        name: 'pin-package-local-dependencies',
        setup(builder) {
          builder.onResolve({ filter: /^[^./]/ }, args => {
            if (
              !args.importer.startsWith(resolve('packages/appraisejs') + '/') ||
              isBuiltin(args.path) ||
              args.path.startsWith('node:')
            )
              return
            return { path: createRequire(args.importer).resolve(args.path), external: false }
          })
        },
      },
    ],
    banner: {
      js: "import { createRequire as m02CreateRequire } from 'node:module'; const require = m02CreateRequire(import.meta.url);",
    },
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node26',
    tsconfig: 'tsconfig.json',
    logLevel: 'silent',
  })
  const path = join(directory, 'canonical-bridge.mjs')
  const sha256 = createHash('sha256')
    .update(await fs.readFile(path))
    .digest('hex')
  await fs.writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({ path, sha256, runtimeLaunched: false }, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  )
  return { path, sha256, runtimeLaunched: false }
}
