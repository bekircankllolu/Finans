'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteStatement } from '@/app/finans/actions'

export function DeleteStatementButton({ id, confirmed }: { id: string; confirmed: boolean }) {
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      className="text-[#5A5A6E] hover:text-[#f08a8a] p-1 disabled:opacity-50"
      aria-label="Ekstreyi sil"
      onClick={() => {
        const withTx = confirmed && window.confirm('Bu ekstreden eklenen işlemler de silinsin mi? (İptal: sadece dosya ve kayıt silinir)')
        if (!confirmed && !window.confirm('Ekstre silinsin mi?')) return
        start(async () => {
          const res = await deleteStatement({ statementId: id, withTransactions: withTx })
          if (!res.ok) alert(res.error)
        })
      }}
    >
      <Trash2 className="w-4 h-4" />
    </button>
  )
}
