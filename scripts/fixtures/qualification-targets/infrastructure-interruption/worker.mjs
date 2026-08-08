import http from 'node:http'

const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end(
    '<!doctype html><title>Interruption Target</title><main data-qualification-target="interruption">active</main>',
  )
})

server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Qualification interruption target did not bind TCP.')
  process.stdout.write(`QUALIFICATION_READY http://127.0.0.1:${address.port}\n`)
})
