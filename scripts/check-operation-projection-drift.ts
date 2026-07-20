#!/usr/bin/env tsx

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import definitions from '../packages/cucumber-runtime/src/operations/definitions.json'
import { listBrowserOperationHandlerRefs } from '../packages/cucumber-runtime/src/operations/index'
import { parseStepFile } from './lib/step-file-parser'

const expectedSignatures = new Set(
  definitions.flatMap(operation =>
    operation.humanProjections.filter(item => !item.deprecated).map(item => item.signature),
  ),
)
const expectedHandlers = new Set(definitions.map(operation => `${operation.handler.id}@${operation.handler.version}`))
const actualSignatures = new Set<string>()
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

for (const relativePath of await glob('automation/steps/{actions,validations}/**/*.step.ts', { cwd: repoRoot })) {
  const source = await fs.readFile(path.join(repoRoot, relativePath), 'utf8')
  const parsed = parseStepFile(source, relativePath)
  for (const step of parsed?.steps ?? []) {
    if (actualSignatures.has(step.signature)) throw new Error(`Duplicate human projection signature: ${step.signature}`)
    actualSignatures.add(step.signature)
    if (!relativePath.includes('/generated/'))
      throw new Error(`Built-in projection exists outside the generated operation path: ${relativePath}`)
    if (!step.functionDefinition.includes('executeHumanOperation('))
      throw new Error(`Generated projection bypasses operation delegation: ${relativePath}`)
    if (/this\.page|resolveLocator|\bexpect\(/.test(step.functionDefinition))
      throw new Error(`Generated projection contains executable browser semantics: ${relativePath}`)
  }
}

const missing = [...expectedSignatures].filter(signature => !actualSignatures.has(signature))
const extra = [...actualSignatures].filter(signature => !expectedSignatures.has(signature))
if (missing.length || extra.length)
  throw new Error(
    `Human projection drift detected. Missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}.`,
  )

const handlerRefs = new Set(listBrowserOperationHandlerRefs())
const missingHandlers = [...expectedHandlers].filter(ref => !handlerRefs.has(ref))
const extraHandlers = [...handlerRefs].filter(ref => !expectedHandlers.has(ref))
if (missingHandlers.length || extraHandlers.length)
  throw new Error(
    `Handler closure drift detected. Missing: ${missingHandlers.join(', ') || 'none'}; extra: ${extraHandlers.join(', ') || 'none'}.`,
  )

console.log(`Operation projections are canonical (${actualSignatures.size} human, ${handlerRefs.size} handlers).`)
