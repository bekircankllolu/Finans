// Sunucudan gelen SSE akışını satır satır okur (fetch + ReadableStream; EventSource POST desteklemez)
export type SSEEvent =
  | { type: 'progress'; step: string; message: string }
  | { type: 'done'; needsVerify?: boolean }
  | { type: 'error'; message: string }

export async function readSSE(res: Response, onEvent: (e: SSEEvent) => void): Promise<void> {
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `İstek başarısız (${res.status})`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      const line = chunk.split('\n').find(l => l.startsWith('data: '))
      if (!line) continue
      const event = JSON.parse(line.slice(6)) as SSEEvent
      if (event.type === 'error') throw new Error(event.message)
      onEvent(event)
    }
  }
}
