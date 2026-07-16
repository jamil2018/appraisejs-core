import { constants as fsConstants, promises as fs } from 'node:fs'

export type LogTail = {
  text: string
  truncated: boolean
  startOffset: number
  endOffset: number
  partialStart: boolean
}

function utf8Boundary(buffer: Buffer): number {
  let index = 0
  while (index < Math.min(buffer.length, 4) && (buffer[index] & 0xc0) === 0x80) index += 1
  return index
}

export async function readLogTail(filePath: string, maxBytes: number): Promise<LogTail> {
  const handle = await fs.open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    const requestedStart = Math.max(0, stat.size - maxBytes - 4)
    const length = stat.size - requestedStart
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, requestedStart)
    const bytes = buffer.subarray(0, bytesRead)
    const desiredStart = Math.max(0, bytes.length - maxBytes)
    const safeStart = desiredStart + utf8Boundary(bytes.subarray(desiredStart))
    let selected = bytes.subarray(safeStart)
    let partialStart = requestedStart + safeStart > 0
    if (partialStart) {
      const newline = selected.indexOf(0x0a)
      if (newline >= 0) {
        selected = selected.subarray(newline + 1)
        partialStart = false
      }
    }
    const startOffset = stat.size - selected.length
    return {
      text: selected.toString('utf8'),
      truncated: startOffset > 0,
      startOffset,
      endOffset: stat.size,
      partialStart,
    }
  } finally {
    await handle.close()
  }
}
