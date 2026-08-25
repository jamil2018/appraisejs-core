#!/usr/bin/env tsx

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import prettier from 'prettier'
import definitions from '../packages/cucumber-runtime/src/operations/definitions.json'
import type { OperationDefinition } from '../packages/cucumber-runtime/src/operations/contracts'
import { parseStepFile } from './lib/step-file-parser'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stepsRoot = path.join(repoRoot, 'automation/steps')
const operations = definitions as Array<
  Omit<OperationDefinition, 'handler'> & { handler: { id: string; version: string } }
>
const canonicalSignatures = new Set(
  operations.flatMap(operation => operation.humanProjections.map(item => item.signature)),
)

const slug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const tsType = (type: OperationDefinition['inputs'][number]['type']) =>
  type === 'number' ? 'number' : type === 'boolean' ? 'boolean' : type === 'locator' ? 'SelectorName' : 'string'

type Projection = {
  operation: (typeof operations)[number]
  projection: (typeof operations)[number]['humanProjections'][number]
  validation: boolean
}

const groups = new Map<string, Projection[]>()
for (const operation of operations) {
  for (const projection of operation.humanProjections) {
    if (projection.deprecated) continue
    const validation =
      operation.id.includes('.assertion') ||
      operation.categories.some(category => category.includes('assertion')) ||
      projection.group.toLowerCase().includes('assertion')
    const key = `${validation ? 'validations' : 'actions'}/generated/${slug(projection.group)}`
    groups.set(key, [...(groups.get(key) ?? []), { operation, projection, validation }])
  }
}

function renderProjection({ operation, projection, validation }: Projection) {
  const inputs = new Map(operation.inputs.map(input => [input.name, input]))
  const parameters = projection.parameterOrder.map(name => {
    const input = inputs.get(name)
    if (!input) throw new Error(`${projection.id} references unknown input ${name}.`)
    return `${name}: ${tsType(input.type)}`
  })
  const inputNames = [...projection.parameterOrder, ...Object.keys(projection.constants)]
  const values = [
    ...projection.parameterOrder.map(name => {
      const input = inputs.get(name)
      if (!input) throw new Error(`${projection.id} references unknown input ${name}.`)
      // Cucumber placeholder values are strings. Canonical JSON inputs keep
      // their typed operation contract by parsing only at the human projection
      // boundary; managed Step Invocations already carry the native value.
      return input.type === 'json' ? `JSON.parse(${name})` : name
    }),
    ...Object.values(projection.constants).map(value => JSON.stringify(value)),
  ]
  return `/**
 * @name ${projection.title}
 * @description ${projection.description ?? operation.description}
 * @icon ${projection.icon}
 */
${validation ? 'Then' : 'When'}(${JSON.stringify(projection.signature)}, async function (this: CustomWorld${parameters.length ? `, ${parameters.join(', ')}` : ''}) {
  await executeHumanOperation(
    ${JSON.stringify(`${operation.handler.id}@${operation.handler.version}`)},
    this,
    ${JSON.stringify(inputNames)},
    [${values.join(', ')}],
  )
})`
}

await fs.mkdir(path.join(stepsRoot, 'actions/generated'), { recursive: true })
await fs.mkdir(path.join(stepsRoot, 'validations/generated'), { recursive: true })
for (const existing of await glob('automation/steps/{generated,actions/generated,validations/generated}/**/*.step.ts', {
  cwd: repoRoot,
}))
  await fs.unlink(path.join(repoRoot, existing))

for (const [key, projections] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
  const group = projections[0]!.projection.group
  const type = projections[0]!.validation ? 'VALIDATION' : 'ACTION'
  const keyword = projections[0]!.validation ? 'Then' : 'When'
  const usesLocator = projections.some(({ operation, projection }) => {
    const inputs = new Map(operation.inputs.map(input => [input.name, input]))
    return projection.parameterOrder.some(name => inputs.get(name)?.type === 'locator')
  })
  const runtimeImports = ['CustomWorld', ...(usesLocator ? ['SelectorName'] : []), keyword, 'executeHumanOperation']
  const content = `import {
${runtimeImports.map(name => `  ${name},`).join('\n')}
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name ${group}
 * @description Generated human projections for canonical ${group} operations
 * @type ${type}
 */

${projections
  .sort((left, right) => left.projection.id.localeCompare(right.projection.id))
  .map(renderProjection)
  .join('\n\n')}
`
  await fs.writeFile(
    path.join(stepsRoot, `${key}.step.ts`),
    await prettier.format(content, {
      parser: 'typescript',
      semi: false,
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 120,
      arrowParens: 'avoid',
    }),
  )
}

for (const relativePath of await glob('automation/steps/{actions,validations}/**/*.step.ts', { cwd: repoRoot })) {
  if (relativePath.includes('/generated/')) continue
  const absolutePath = path.join(repoRoot, relativePath)
  const parsed = parseStepFile(await fs.readFile(absolutePath, 'utf8'), relativePath)
  if (parsed?.steps.length && parsed.steps.every(step => canonicalSignatures.has(step.signature)))
    await fs.unlink(absolutePath)
}

console.log(`Generated ${operations.length} canonical operation projection file entries across ${groups.size} groups.`)
