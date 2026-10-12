const birthMarker = `${process.pid}:${process.hrtime.bigint()}`

process.stdout.write(`${JSON.stringify({ method: 'provider/ready', params: { pid: process.pid, birthMarker } })}\n`)
process.stdin.resume()
process.stdin.on('data', () => {})
setInterval(() => {}, 1_000)
