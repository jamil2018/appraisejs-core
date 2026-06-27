#!/usr/bin/env node
/**
 * Applies repo line-ending policy to the local clone so `git diff` matches
 * .gitattributes / EditorConfig / Prettier (LF everywhere).
 *
 * Usage:
 *   node scripts/configure-git-line-endings.mjs
 *   node scripts/configure-git-line-endings.mjs --renormalize
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(scriptDir, '..')
const gitConfigInclude = '../.gitconfig.appraise'
const quiet = process.argv.includes('--quiet')

function log(message) {
  if (!quiet) {
    console.log(message)
  }
}

function runGit(args, options = {}) {
  const stdio = options.stdio ?? ['pipe', 'pipe', 'pipe']
  const result = execSync(['git', ...args].join(' '), {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio,
    ...options,
  })

  if (stdio !== 'inherit' && result != null) {
    return String(result).trim()
  }

  return ''
}

function isGitRepository() {
  return existsSync(join(repoRoot, '.git'))
}

function getLocalConfig(key) {
  try {
    return runGit(['config', '--local', '--get', key])
  } catch {
    return null
  }
}

function setLocalConfig(key, value) {
  runGit(['config', '--local', key, value], { stdio: 'inherit' })
}

function ensureGitInclude() {
  const current = getLocalConfig('include.path')
  if (current === gitConfigInclude) {
    return false
  }

  setLocalConfig('include.path', gitConfigInclude)
  log(`Linked local git config: include.path = ${gitConfigInclude}`)
  return true
}

function main() {
  if (!isGitRepository()) {
    log('Not a git repository; skipping git line-ending configuration.')
    return
  }

  const updatedInclude = ensureGitInclude()

  if (!updatedInclude && !quiet) {
    log('Git line-ending settings already use .gitconfig.appraise (LF, autocrlf=false).')
  }

  if (process.argv.includes('--renormalize')) {
    log('Staging removals so renormalize does not fail on deleted tracked paths...')
    runGit(['add', '-u'], { stdio: 'inherit' })
    log('Renormalizing line endings in the index (may update staged content)...')
    runGit(['add', '--renormalize', '.'], { stdio: 'inherit' })
    log('Renormalize complete. Review with: git status')
  }
}

main()
