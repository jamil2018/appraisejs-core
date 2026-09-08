import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

function probe(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 10_000 })
  return { available: result.status === 0, status: result.status, error: result.error?.code ?? null }
}
const status = spawnSync('git', ['status', '--porcelain=v1', '-z'], { encoding: 'utf8', timeout: 10_000 })
console.log(
  JSON.stringify(
    {
      version: 1,
      node: {
        version: process.version,
        supported:
          Number(process.versions.node.split('.')[0]) > 20 ||
          (Number(process.versions.node.split('.')[0]) === 20 && Number(process.versions.node.split('.')[1]) >= 19),
      },
      dependencies: { installed: fs.existsSync('node_modules'), npm: probe('npm', ['--version']) },
      git: { available: status.status === 0, clean: status.status === 0 ? status.stdout.length === 0 : null },
      skills: ['swarm-orchestrator', 'graphify'].map(name => ({
        name,
        present: fs.existsSync(`.agents/skills/${name}/SKILL.md`),
      })),
      browser: {
        packagePresent: fs.existsSync('node_modules/@playwright/test'),
        liveSession: 'unknown',
        reason: 'CLI cannot verify host browser plugin/session capabilities',
      },
      hostSelection: {
        configured: fs.existsSync('.codex/config.toml'),
        effectiveRole: 'unverified',
        effectiveModel: 'unverified',
        effectiveSandbox: 'unverified',
        reason: 'Supply host capability evidence to selection adapter; static files are not runtime proof',
      },
    },
    null,
    2,
  ),
)
