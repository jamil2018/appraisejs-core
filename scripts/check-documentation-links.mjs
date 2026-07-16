#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const roots = [
  'README.md',
  'AGENTS.md',
  'docs',
  ...fs
    .readdirSync('.agents/skills', { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('appraise-'))
    .map(entry => path.join('.agents/skills', entry.name)),
  'packages/appraisejs',
  'packages/create-appraisejs',
]
const ignoredDirectories = new Set(['node_modules', 'dist', 'templates', 'graphify-out'])

function markdownFiles(entry) {
  if (!fs.existsSync(entry)) return []
  const stat = fs.statSync(entry)
  if (stat.isFile()) return entry.endsWith('.md') ? [entry] : []
  return fs.readdirSync(entry, { withFileTypes: true }).flatMap(child => {
    if (child.isDirectory() && ignoredDirectories.has(child.name)) return []
    return markdownFiles(path.join(entry, child.name))
  })
}

const failures = []
for (const file of [...new Set(roots.flatMap(markdownFiles))]) {
  const contents = fs.readFileSync(file, 'utf8')
  for (const match of contents.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, '')
    if (/^(?:https?:|mailto:|appraise:|#|\/)/.test(rawTarget)) continue
    const targetWithoutTitle = rawTarget.replace(/\s+["'][^"']*["']$/, '')
    const target = decodeURIComponent(targetWithoutTitle.split('#')[0])
    if (!target) continue
    const resolved = path.resolve(path.dirname(file), target)
    if (!fs.existsSync(resolved)) failures.push(`${file}: missing link target ${target}`)
  }
}

if (failures.length > 0) {
  console.error('Documentation link check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Documentation links resolve to current local targets.')
