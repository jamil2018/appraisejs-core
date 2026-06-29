import path from 'node:path'

function envValue(env, key, fallback) {
  return env[key] ?? fallback
}

function normalizeEndpointPath(endpointPath) {
  return endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`
}

export function resolveMcpConfig(cwd = process.cwd(), env = process.env) {
  const endpointPath = normalizeEndpointPath(envValue(env, 'APPRAISE_MCP_PATH', '/mcp'))
  const host = envValue(env, 'APPRAISE_MCP_HOST', '127.0.0.1')
  const port = envValue(env, 'APPRAISE_MCP_PORT', '3010')
  const baseUrl = envValue(env, 'APPRAISE_MCP_BASE_URL', 'http://127.0.0.1:3000')
  const resolvedProjectPath = path.resolve(cwd)

  return {
    endpoint: `http://${host}:${port}${endpointPath}`,
    baseUrl,
    resolvedProjectPath,
    directStdioConfig: {
      command: 'appraisejs',
      args: ['mcp', '--cwd', resolvedProjectPath, '--base-url', baseUrl],
    },
    skillPath: path.join(resolvedProjectPath, '.agents', 'skills', 'appraise-project-from-brief'),
  }
}
