// Explicit test-only Node executable body. No auth/config files, network, provider or browser access.
/* eslint-disable @typescript-eslint/no-require-imports -- This inert body executes directly as a CommonJS Node executable. */
const readline = require('node:readline')
const input = readline.createInterface({ input: process.stdin })
input.on('line', line => {
  const request = JSON.parse(line)
  if (request.method !== 'initialize') return
  const reply =
    typeof refuseInitialize !== 'undefined' && refuseInitialize
      ? { id: request.id, error: { code: -32600, message: 'synthetic refusal' } }
      : {
          id: request.id,
          result: { userAgent: 'inert', platformFamily: 'unix', platformOs: 'test', codexHome: process.env.CODEX_HOME },
        }
  process.stdout.write(JSON.stringify(reply) + '\n')
})
