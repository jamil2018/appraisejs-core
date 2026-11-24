import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { configuredMacCodexReadExecutable, openMacCodexReadTransport } from './codex-read-launcher'

const nativeCanaries = process.platform === 'darwin' && process.env.APPRAISE_NATIVE_SANDBOX_TEST === '1'
const nativeCodex = process.platform === 'darwin' && process.env.APPRAISE_NATIVE_REAL_CODEX_TEST === '1'
const temporary: string[] = []

afterEach(() => {
  for (const name of temporary.splice(0)) rmSync(name, { force: true, recursive: true })
})

describe('native Codex read launcher', () => {
  it('rejects incomplete or invalid explicit configuration', () => {
    const previousPath = process.env.APPRAISE_CODEX_READ_EXECUTABLE
    const previousHash = process.env.APPRAISE_CODEX_READ_SHA256
    try {
      delete process.env.APPRAISE_CODEX_READ_EXECUTABLE
      delete process.env.APPRAISE_CODEX_READ_SHA256
      expect(configuredMacCodexReadExecutable()).toBeUndefined()
      process.env.APPRAISE_CODEX_READ_EXECUTABLE = '/tmp/codex'
      expect(() => configuredMacCodexReadExecutable()).toThrow('incomplete')
      process.env.APPRAISE_CODEX_READ_SHA256 = 'not-a-hash'
      expect(() => configuredMacCodexReadExecutable()).toThrow('Invalid')
    } finally {
      if (previousPath === undefined) delete process.env.APPRAISE_CODEX_READ_EXECUTABLE
      else process.env.APPRAISE_CODEX_READ_EXECUTABLE = previousPath
      if (previousHash === undefined) delete process.env.APPRAISE_CODEX_READ_SHA256
      else process.env.APPRAISE_CODEX_READ_SHA256 = previousHash
    }
  })

  it('refuses an aborted launch before any process effects', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      openMacCodexReadTransport(
        {
          executable: '/tmp/codex',
          sha256: 'a'.repeat(64),
          brokerPort: 1,
          brokerToken: 'synthetic-read-token',
          args: ['app-server'],
        },
        controller.signal,
      ),
    ).rejects.toThrow()
  })

  it.runIf(nativeCanaries)(
    'enforces disposable file, process, and socket canaries with the real Seatbelt host',
    async () => {
      const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'appraise-codex-canary-')))
      temporary.push(root)
      const executable = path.join(root, 'codex')
      const source = path.join(root, 'canary.c')
      const forbidden = path.join(root, 'outside-secret.txt')
      writeFileSync(forbidden, 'inert canary only')
      writeFileSync(
        source,
        `#include <errno.h>\n#include <fcntl.h>\n#include <netinet/in.h>\n#include <spawn.h>\n#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n#include <sys/socket.h>\n#include <sys/wait.h>\n#include <unistd.h>\n
static int connection(int port) {
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in address = {0};
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  address.sin_port = htons(port);
  int result = connect(fd, (struct sockaddr *)&address, sizeof(address));
  int code = result == 0 ? 0 : errno;
  close(fd);
  return code;
}
int main(int argc, char **argv) {
  if (argc > 1 && strcmp(argv[1], "--child") == 0) return 0;
  int file = open(argv[4], O_RDONLY);
  int fileCode = file >= 0 ? 0 : errno;
  if (file >= 0) close(file);
  pid_t pid = 0;
  char *const childArgs[] = {"/bin/echo", "inert", NULL};
  int processCode = posix_spawn(&pid, "/bin/echo", NULL, NULL, childArgs, NULL);
  char *const selfArgs[] = {argv[0], "--child", NULL};
  int selfCode = posix_spawn(&pid, argv[0], NULL, NULL, selfArgs, NULL);
  if (selfCode == 0) waitpid(pid, NULL, 0);
  printf("%d %d %d %d %d\\n", fileCode, processCode, selfCode, connection(atoi(argv[5])), connection(atoi(argv[6])));
  fflush(stdout);
  return 0;
}\n`,
      )
      const compiled = spawnSync('/usr/bin/clang', ['-o', executable, source], { encoding: 'utf8' })
      expect(compiled.status, compiled.stderr).toBe(0)
      const sha256 = createHash('sha256').update(readFileSync(executable)).digest('hex')
      const broker = createServer(socket => socket.end())
      const other = createServer(socket => socket.end())
      try {
        await Promise.all([
          new Promise<void>(resolve => broker.listen(0, '127.0.0.1', resolve)),
          new Promise<void>(resolve => other.listen(0, '127.0.0.1', resolve)),
        ])
        const brokerPort = (broker.address() as { port: number }).port
        const otherPort = (other.address() as { port: number }).port
        const transport = await openMacCodexReadTransport(
          {
            executable,
            sha256,
            brokerPort,
            brokerToken: 'synthetic-read-token',
            args: ['app-server', '--listen', 'stdio://', forbidden, String(brokerPort), String(otherPort)],
          },
          new AbortController().signal,
        )
        try {
          let output = ''
          for await (const chunk of transport.stdout) output += chunk.toString()
          const [file, process, selfSpawn, allowed, denied] = output.trim().split(' ').map(Number)
          expect(file).toBe(1) // EPERM
          expect(process).toBe(1) // EPERM
          expect(selfSpawn).toBe(1) // EPERM, despite the exact executable being allowed for process-exec
          expect(allowed).toBe(0)
          expect(denied).toBe(1) // EPERM
        } finally {
          await transport.stop()
        }
      } finally {
        broker.close()
        other.close()
      }
    },
  )

  it.runIf(nativeCodex)(
    'starts the pinned Codex app-server in an isolated home with an inert initialize exchange',
    async () => {
      const configured = configuredMacCodexReadExecutable()
      expect(configured).toBeDefined()
      const broker = createServer(socket => socket.end())
      await new Promise<void>(resolve => broker.listen(0, '127.0.0.1', resolve))
      try {
        const port = (broker.address() as { port: number }).port
        const transport = await openMacCodexReadTransport(
          {
            ...configured!,
            brokerPort: port,
            brokerToken: 'synthetic-read-token',
            args: ['app-server', '--listen', 'stdio://'],
          },
          new AbortController().signal,
        )
        try {
          const initialized = new Promise<Record<string, unknown>>((resolve, reject) => {
            let pending = ''
            const timeout = setTimeout(() => {
              transport.stdout.removeListener('data', onData)
              reject(new Error('Pinned Codex app-server did not initialize within 10 seconds.'))
            }, 10_000)
            const onData = (chunk: Buffer) => {
              pending += chunk.toString('utf8')
              const lines = pending.split('\n')
              pending = lines.pop() ?? ''
              for (const line of lines) {
                const frame = JSON.parse(line) as Record<string, unknown>
                if (frame.id === 0) {
                  clearTimeout(timeout)
                  transport.stdout.removeListener('data', onData)
                  resolve(frame)
                  return
                }
              }
            }
            transport.stdout.on('data', onData)
          })
          transport.stdin.write(
            JSON.stringify({
              id: 0,
              method: 'initialize',
              params: {
                clientInfo: { name: 'AppraiseJS', title: 'AppraiseJS', version: '0.4.0' },
                capabilities: { experimentalApi: true },
              },
            }) + '\n',
          )
          expect(await initialized).toHaveProperty('result')
        } finally {
          await transport.stop()
        }
      } finally {
        broker.close()
      }
    },
    30_000,
  )
})
