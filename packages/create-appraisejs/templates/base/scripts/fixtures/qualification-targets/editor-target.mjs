import http from 'node:http'
import { spawn } from 'node:child_process'

export function startEditorTarget({ status, label }) {
  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Notebook Editor</title></head>
  <body>
    <main aria-label="Notebook editor">
      <header><h1>Project notebook</h1><p data-save-status="${status}">${label}</p></header>
      <nav aria-label="Editor actions"><button type="button">Save</button><button type="button">Preview</button></nav>
      <label for="document">Document</label>
      <textarea id="document" rows="12">Release checklist</textarea>
    </main>
  </body>
</html>`
  const server = http.createServer((request, response) => {
    if (request.url !== '/') {
      response.writeHead(404)
      response.end('Not found')
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(html)
  })
  server.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Qualification target did not bind a TCP port.')
    process.stdout.write(`QUALIFICATION_READY http://127.0.0.1:${address.port}\n`)
  })
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(() => process.exit(0)))
  }
}

export async function readEditorTarget(directory) {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) =>
      reject(new Error(`Target exited before readiness (code=${code}, signal=${signal}).`)),
    )
    child.stdout.on('data', chunk => {
      output += String(chunk)
      if (output.includes('QUALIFICATION_READY ')) resolve()
    })
  })
  const match = output.match(/QUALIFICATION_READY (http:\/\/127\.0\.0\.1:\d+)/)
  if (!match) throw new Error(`Target did not publish a loopback URL: ${output}`)
  const response = await fetch(match[1])
  return { child, response, page: await response.text() }
}

export async function stopEditorTarget(child) {
  child.kill('SIGTERM')
  await new Promise(resolve => child.once('exit', resolve))
}
