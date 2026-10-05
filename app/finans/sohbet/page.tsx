import { Chat } from '@/components/finans/Chat'
import { PageHeader } from '@/components/finans/ui'
import { getFinanceContext } from '@/lib/finans/load'

export default async function ChatPage() {
  const { supabase } = await getFinanceContext()
  const { data } = await supabase.from('fin_chat_messages').select('role, content').order('created_at', { ascending: true }).limit(100)

  return (
    <>
      <PageHeader title="AI danışman" subtitle="Harcamaların, borçların ve planların hakkında soru sor." />
      <Chat initial={(data ?? []).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))} />
    </>
  )
}
