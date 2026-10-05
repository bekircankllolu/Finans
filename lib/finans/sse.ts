// Server-Sent Events yanıtı: uzun AI işlemlerinde ilerlemeyi anlık göndermek için
export function sseResponse(run: (send: (data: object) => void) => Promise<void>): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      // Proxy'lerin bağlantıyı kesmemesi için her 15 sn'de bir yorum satırı
      const ping = setInterval(() => controller.enqueue(encoder.encode(': ping\n\n')), 15_000)
      try {
        await run(send)
      } catch (err) {
        console.error('[finans sse]', err)
        send({ type: 'error', message: err instanceof Error ? err.message : 'Beklenmeyen hata' })
      } finally {
        clearInterval(ping)
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  })
}
