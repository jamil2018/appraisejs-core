import path from 'node:path'

function envValue(env, key, fallback) {
  return env[key] ?? fallback
}

function normalizeEndpointPath(endpointPath) {
  return endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

export function resolveMcpConfig(cwd = process.cwd(), env = process.env) {
  const endpointPath = normalizeEndpointPath(envValue(env, 'APPRAISE_MCP_PATH', '/mcp'))
  const host = envValue(env, 'APPRAISE_MCP_HOST', '127.0.0.1')
  const port = envValue(env, 'APPRAISE_MCP_PORT', '3010')
  const baseUrl = envValue(env, 'APPRAISE_MCP_BASE_URL', 'http://127.0.0.1:3000')
  const resolvedProjectPath = path.resolve(cwd)
  const cliPath = path.join(resolvedProjectPath, 'packages', 'appraisejs', 'dist', 'cli.js')
  const stdioArgs = ['mcp', '--cwd', resolvedProjectPath, '--base-url', baseUrl]
  const codexStdioCommand = [process.execPath, cliPath, ...stdioArgs].map(shellQuote).join(' ')

  return {
    endpoint: `http://${host}:${port}${endpointPath}`,
    baseUrl,
    resolvedProjectPath,
    directStdioConfig: {
      command: process.execPath,
      args: [cliPath, ...stdioArgs],
    },
    codex: {
      inspectCommand: 'codex mcp get appraisejs',
      removeCommand: 'codex mcp remove appraisejs',
      addCommand: `codex mcp add appraisejs -- ${codexStdioCommand}`,
      verifyCommand: 'codex mcp get appraisejs',
    },
    skillPath: path.join(resolvedProjectPath, '.agents', 'skills', 'appraise-project-from-brief'),
  }
}
