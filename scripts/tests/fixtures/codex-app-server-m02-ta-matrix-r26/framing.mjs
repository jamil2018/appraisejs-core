/** R19 JSONL framing retains each original line's byte count, never its raw payload. */
export class CountedJsonLines {
  #limits
  #buffer = Buffer.alloc(0)
  #total = 0
  #frames = 0
  #fenced = false

  constructor({ maxFrameBytes = 65536, maxTotalBytes = 1048576, maxFrames = 256 } = {}) {
    this.#limits = { maxFrameBytes, maxTotalBytes, maxFrames }
    for (const n of Object.values(this.#limits))
      if (!Number.isSafeInteger(n) || n < 1) throw new Error('invalid limits')
  }

  feed(chunk) {
    if (this.#fenced) throw new Error('framing fenced')
    try {
      if (!Buffer.isBuffer(chunk)) throw new Error('byte buffer required')
      this.#total += chunk.length
      if (this.#total > this.#limits.maxTotalBytes) throw new Error('stream limit')
      this.#buffer = Buffer.concat([this.#buffer, chunk])
      const frames = []
      let end
      while ((end = this.#buffer.indexOf(10)) >= 0) {
        if (end === 0 || end > this.#limits.maxFrameBytes || ++this.#frames > this.#limits.maxFrames)
          throw new Error('frame limit')
        const text = new TextDecoder('utf-8', { fatal: true }).decode(this.#buffer.subarray(0, end))
        const frame = JSON.parse(text)
        if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw new Error('object frame required')
        frames.push({ frame, originalByteCount: end + 1 })
        this.#buffer = this.#buffer.subarray(end + 1)
      }
      if (this.#buffer.length > this.#limits.maxFrameBytes) throw new Error('partial frame limit')
      return frames
    } catch {
      this.#fenced = true
      throw new Error('malformed or oversized JSONL stream')
    }
  }

  eof() {
    this.#fenced = true
    if (this.#buffer.length) throw new Error('partial EOF: UNKNOWN')
  }
}
