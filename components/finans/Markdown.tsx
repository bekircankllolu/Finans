import { Fragment, type ReactNode } from 'react'

// Rapor ve sohbet için küçük, güvenli markdown: başlık, liste, kalın/italik, kod, paragraf.
// HTML enjekte etmez; her şey React elemanı olarak üretilir.
function inline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g)
  return parts.map((p, i) => {
    const key = `${keyBase}-${i}`
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={key} className="font-semibold text-[#F0F0F5]">{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`')) return <code key={key} className="px-1 rounded bg-white/8 text-[0.9em]">{p.slice(1, -1)}</code>
    if (p.startsWith('_') && p.endsWith('_') && p.length > 2) return <em key={key}>{p.slice(1, -1)}</em>
    return <Fragment key={key}>{p}</Fragment>
  })
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={`p${blocks.length}`} className="my-2">{inline(para.join(' '), `p${blocks.length}`)}</p>)
      para = []
    }
  }
  const flushList = () => {
    if (list) {
      const Tag = list.ordered ? 'ol' : 'ul'
      const k = `l${blocks.length}`
      blocks.push(
        <Tag key={k} className={`my-2 pl-5 space-y-1 ${list.ordered ? 'list-decimal' : 'list-disc'} marker:text-[#5A5A6E]`}>
          {list.items.map((it, i) => (
            <li key={i}>{inline(it, `${k}-${i}`)}</li>
          ))}
        </Tag>,
      )
      list = null
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/)

    if (heading) {
      flushPara()
      flushList()
      const level = heading[1].length
      const cls = level <= 2 ? 'text-base font-semibold mt-5 mb-2 text-[#F0F0F5]' : 'text-sm font-semibold mt-4 mb-1 text-[#F0F0F5]'
      blocks.push(<h3 key={`h${blocks.length}`} className={cls}>{inline(heading[2], `h${blocks.length}`)}</h3>)
    } else if (bullet || ordered) {
      flushPara()
      const isOrdered = !!ordered
      if (!list || list.ordered !== isOrdered) {
        flushList()
        list = { ordered: isOrdered, items: [] }
      }
      list.items.push((bullet ?? ordered)![1])
    } else if (line.trim() === '' || /^-{3,}$/.test(line.trim())) {
      flushPara()
      flushList()
    } else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara()
  flushList()
  return <div className="text-sm leading-relaxed text-[#C3C2CF]">{blocks}</div>
}
