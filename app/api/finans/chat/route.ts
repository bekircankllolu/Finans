import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { runChat } from '@/lib/finans/ai/chat'
import { buildSnapshot } from '@/lib/finans/calc/snapshot'
import { todayISO } from '@/lib/finans/calc/dates'
import { errorResponse, getFinanceUser, loadFinanceData } from '@/lib/finans/server'

export const maxDuration = 300

const Input = z.object({ message: z.string().min(1).max(4000) })

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof getFinanceUser>>
  let message: string
  try {
    ctx = await getFinanceUser()
    message = Input.parse(await request.json()).message
  } catch (err) {
    return errorResponse(err)
  }
  const { supabase } = ctx

  const [{ data: history }, data] = await Promise.all([
    supabase.from('fin_chat_messages').select('role, content').order('created_at', { ascending: false }).limit(20),
    loadFinanceData(supabase),
  ])
  const snapshot = buildSnapshot(data, todayISO())
  const messages: Anthropic.MessageParam[] = [
    ...(history ?? []).reverse().map(h => ({ role: h.role as 'user' | 'assistant', content: h.content as string })),
    { role: 'user', content: message },
  ]
  // Geçmiş asistan mesajıyla başlıyorsa (limit kesmesi) API ilk mesajın user olmasını ister
  while (messages[0]?.role === 'assistant') messages.shift()

  await supabase.from('fin_chat_messages').insert({ role: 'user', content: message })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      try {
        const gen = runChat(messages, snapshot, data)
        let step = await gen.next()
        while (!step.done) {
          send(step.value)
          step = await gen.next()
        }
        const answer = step.value
        if (answer) await supabase.from('fin_chat_messages').insert({ role: 'assistant', content: answer })
        send({ type: 'done' })
      } catch (err) {
        console.error('[finans chat]', err)
        send({ type: 'error', message: err instanceof Error ? err.message : 'Sohbet hatası' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
