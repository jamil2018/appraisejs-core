import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { graphInputDigest, graphFreshness, recordGraphFreshness } from '../lib/graphify-freshness.mjs'

test('graph freshness detects edits, deletion-only changes, output tampering and interrupted refresh', t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-freshness-'))
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  fs.mkdirSync(path.join(cwd, 'scripts/graphify-out'), { recursive: true })
  assert.equal(graphFreshness('scripts', cwd).status, 'missing')
  fs.writeFileSync(path.join(cwd, 'scripts/graphify-out/graph.json'), '{}')
  fs.writeFileSync(path.join(cwd, 'scripts/a.mjs'), 'a')
  assert.equal(graphFreshness('scripts', cwd).status, 'unknown')
  const digest = graphInputDigest('scripts', cwd)
  recordGraphFreshness('scripts', digest, cwd)
  assert.equal(graphFreshness('scripts', cwd).status, 'fresh')
  fs.writeFileSync(path.join(cwd, '.graphifyignore'), 'scripts/a.mjs\n')
  assert.equal(graphFreshness('scripts', cwd).status, 'stale')
  fs.unlinkSync(path.join(cwd, '.graphifyignore'))
  assert.equal(graphFreshness('scripts', cwd).status, 'fresh')
  fs.writeFileSync(path.join(cwd, 'package.json'), '{"scripts":{"graphify:build:scripts":"true"}}')
  assert.equal(graphFreshness('scripts', cwd).status, 'stale')
  fs.unlinkSync(path.join(cwd, 'package.json'))
  assert.equal(graphFreshness('scripts', cwd).status, 'fresh')
  fs.writeFileSync(path.join(cwd, 'scripts/graphify-out/graph.json'), '{"changed":true}')
  assert.equal(graphFreshness('scripts', cwd).status, 'stale')
  fs.unlinkSync(path.join(cwd, 'scripts/a.mjs'))
  assert.equal(graphFreshness('scripts', cwd).status, 'stale')
  assert.throws(() => recordGraphFreshness('scripts', digest, cwd), /changed during/)
})

test('automatic graph selection includes deletion-only and renamed source paths', async t => {
  const { spawnSync } = await import('node:child_process')
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-deletion-'))
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  const git = args => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  git(['init', '-q'])
  fs.mkdirSync(path.join(cwd, 'scripts'))
  fs.writeFileSync(path.join(cwd, 'scripts/old.mjs'), 'export const old = true')
  git(['add', '.'])
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'])
  fs.unlinkSync(path.join(cwd, 'scripts/old.mjs'))
  const command = path.resolve('scripts/update-graphify-graphs.mjs')
  const result = spawnSync(process.execPath, [command, '--dry-run'], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Graphify auto-update: scripts/)
  fs.mkdirSync(path.join(cwd, 'src'))
  fs.writeFileSync(path.join(cwd, 'src/new.mjs'), 'export const old = true')
  git(['add', '-A'])
  const renamed = spawnSync(process.execPath, [command, '--dry-run'], { cwd, encoding: 'utf8' })
  assert.equal(renamed.status, 0, renamed.stderr)
  assert.match(renamed.stdout, /src, scripts/)
})

test('freshness and execution resolve the same PATH Graphify before fallback', async t => {
  const { resolveGraphifyExecutable } = await import('../lib/graphify-executable.mjs')
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-executable-'))
  const previousPath = process.env.PATH
  t.after(() => {
    process.env.PATH = previousPath
    fs.rmSync(cwd, { recursive: true, force: true })
  })
  fs.mkdirSync(path.join(cwd, 'scripts/graphify-out'), { recursive: true })
  fs.writeFileSync(path.join(cwd, 'scripts/graphify-out/graph.json'), '{}')
  const executable = path.join(cwd, 'graphify')
  fs.writeFileSync(executable, '#!/bin/sh\necho fixture-v1\n', { mode: 0o755 })
  process.env.PATH = `${cwd}${path.delimiter}${previousPath}`
  assert.equal(resolveGraphifyExecutable(), executable)
  recordGraphFreshness('scripts', graphInputDigest('scripts', cwd), cwd)
  assert.equal(graphFreshness('scripts', cwd).status, 'fresh')
  fs.writeFileSync(executable, '#!/bin/sh\necho fixture-v2\n', { mode: 0o755 })
  assert.equal(graphFreshness('scripts', cwd).status, 'stale')
})
