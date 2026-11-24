/** Decode one SSE event, including data fields split across lines. */
export function readChatGptStreamEvent(frame: string): unknown {
  const data = frame
    .split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
    .join('\n')
  if (!data || data === '[DONE]') return undefined
  return JSON.parse(data)
}
