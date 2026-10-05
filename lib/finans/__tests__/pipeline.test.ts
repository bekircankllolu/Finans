import { describe, expect, it } from 'vitest'
import { detectBank } from '../banks'
import { applyBankRules, learnBankRules } from '../bankRules'
import { dictionaryCategory } from '../merchants-tr'
import { rulePattern } from '../merchant'
import { reconcile } from '../reconcile'
import { applyCorrections, buildDraft, runExtraction, runVerification, type PipelineContext } from '../statementPipeline'
import { categoryForType } from '../txTypes'
import { CATEGORIES, catId, enparaChecking, garantiBonus, ykbMissingRow } from './fixtures'

const ctx: PipelineContext = { categories: CATEGORIES, userRules: [], bankRules: [], hasLoans: false }

describe('banka tanıma', () => {
  it('banka adı, alias ve kart markasından tanır', () => {
    expect(detectBank('Garanti BBVA')?.id).toBe('garanti')
    expect(detectBank(null, 'World Card', 'Yapı Kredi World')?.id).toBe('yapikredi')
    expect(detectBank(null, 'Maximum Kart')?.id).toBe('isbank')
    expect(detectBank('QNB Enpara')?.id).toBe('qnb')
    expect(detectBank(null, 'Axess')?.id).toBe('akbank')
    expect(detectBank('DenizBank', 'Bonus')?.id).toBe('denizbank')
    expect(detectBank('Bilinmeyen Banka')).toBeNull()
  })
})

describe('kategori kaynakları', () => {
  it('işyeri sözlüğü yaygın TR işyerlerini tanır', () => {
    expect(dictionaryCategory('MIGROS SANAL MARKET')).toBe('Market')
    expect(dictionaryCategory('NETFLIX.COM')).toBe('Abonelikler')
    expect(dictionaryCategory('SHELL ALANYA')).toBe('Ulaşım & Akaryakıt')
    expect(dictionaryCategory('TURKCELL FATURA')).toBe('Faturalar')
    expect(dictionaryCategory('RASTGELE DUKKAN')).toBeNull()
  })

  it('kesin işlem tiplerini kategoriye eşler', () => {
    expect(categoryForType('payment')).toBe('Transfer / Kart Ödemesi')
    expect(categoryForType('loan_payment')).toBe('Kredi Ödemesi')
    expect(categoryForType('cash_advance')).toBe('Nakit Çekim')
    expect(categoryForType('tax', 'BSMV')).toBe('Faiz & Banka Ücretleri')
    expect(categoryForType('purchase')).toBeNull()
  })
})

describe('toplam kontrolü', () => {
  it('kart: önceki borç + harcama − ödeme = dönem borcu', () => {
    const d = buildDraft(garantiBonus, ctx)
    expect(d.reconciliation.status).toBe('ok')
    expect(d.reconciliation.totals.out).toBeCloseTo(41_750, 2)
    expect(d.reconciliation.totals.in).toBeCloseTo(30_450, 2)
  })

  it('vadesiz: açılış + giriş − çıkış = kapanış; eksi bakiye KMH önerisi verir', () => {
    const d = buildDraft(enparaChecking, ctx)
    expect(d.reconciliation.status).toBe('ok')
    expect(d.suggestions.some(s => s.includes('KMH'))).toBe(true)
    expect(d.suggestions.some(s => s.includes('Kredi taksiti'))).toBe(true)
  })

  it('özet alanı yoksa durum bilinmiyor', () => {
    const r = reconcile({ account_type: 'credit_card', previous_balance: null, total_debt: null, opening_balance: null, closing_balance: null, payments_total: null, purchases_total: null }, [])
    expect(r.status).toBe('unknown')
  })

  it('fark tek satırla açıklanabiliyorsa şüpheli satırı işaretler', () => {
    const d = buildDraft(ykbMissingRow, ctx)
    expect(d.reconciliation.status).toBe('mismatch')
    // 20000 + (3000+3200+16800) − (20000+300) = 22700; dönem borcu 24150 → fark 1450
    expect(d.reconciliation.diff).toBeCloseTo(1_450, 2)
  })
})

describe('taslak satırları', () => {
  it('banka, tip, kategori kaynağı ve bayraklar doğru', () => {
    const d = buildDraft(garantiBonus, ctx)
    expect(d.meta.bank_id).toBe('garanti')
    const byDesc = (s: string) => d.transactions.find(t => t.description.includes(s))!
    expect(byDesc('OTOMATIK ODEME').category_id).toBe(catId('Transfer / Kart Ödemesi'))
    expect(byDesc('OTOMATIK ODEME').category_source).toBe('type')
    // AI "Eğlence" dedi ama sözlük Netflix'i Abonelikler'e koyar
    expect(byDesc('NETFLIX').category_id).toBe(catId('Abonelikler'))
    expect(byDesc('NETFLIX').original_currency).toBe('USD')
    expect(byDesc('MEDIAMARKT').installment_total).toBe(9)
    expect(byDesc('POS 4471').flags).toContain('low_confidence')
    expect(d.transactions.every(t => t.include && !t.duplicate)).toBe(true)
  })

  it('dönem dışı tarihleri işaretler', () => {
    const shifted = { ...garantiBonus, transactions: [{ ...garantiBonus.transactions[1], date: '2025-08-26' }] }
    expect(buildDraft(shifted, ctx).transactions[0].flags).toContain('date_outside_period')
  })

  it('kullanıcı kuralı tip eşlemesinden önce gelir', () => {
    const d = buildDraft(garantiBonus, { ...ctx, userRules: [{ pattern: rulePattern('POS ANTALYA'), category_id: catId('Kira & Aidat') }] })
    expect(d.transactions.find(t => t.description.includes('POS 4471'))!.category_source).toBe('rule')
  })
})

describe('öğrenen banka kuralları', () => {
  it('kullanıcının çevirdiği yönü öğrenir ve sonraki ekstrede uygular', () => {
    const d = buildDraft(ykbMissingRow, ctx)
    const worldpuan = d.transactions.find(t => t.description.includes('WORLDPUAN'))!
    const edited = d.transactions.map(t => (t.tempId === worldpuan.tempId ? { ...t, include: false } : t))
    const rules = learnBankRules(d.meta.bank_id, edited, true)
    expect(rules).toEqual([{ bank: 'yapikredi', pattern: 'worldpuan kazanım', kind: 'exclude', value: 'true' }])

    const again = buildDraft(ykbMissingRow, { ...ctx, bankRules: rules })
    const row = again.transactions.find(t => t.description.includes('WORLDPUAN'))!
    expect(row.include).toBe(false)
    expect(row.flags).toContain('bank_rule_excluded')
  })

  it('hariç tutma sadece istenirse öğrenilir; yön değişikliği her zaman', () => {
    const d = buildDraft(garantiBonus, ctx)
    const edited = d.transactions.map((t, i) => (i === 1 ? { ...t, direction: 'in' as const } : i === 2 ? { ...t, include: false } : t))
    const rules = learnBankRules('garanti', edited, false)
    expect(rules.map(r => r.kind)).toEqual(['direction'])
    expect(applyBankRules([{ description: 'MIGROS SANAL MARKET ISTANBUL', direction: 'out' as const, include: true, flags: [] }], rules, 'garanti')[0].direction).toBe('in')
    expect(applyBankRules([{ description: 'MIGROS SANAL MARKET ISTANBUL', direction: 'out' as const, include: true, flags: [] }], rules, 'akbank')[0].direction).toBe('out')
  })
})

describe('kontrol turu', () => {
  it('fark varsa AI düzeltmelerini uygular ve toplamlar tutar', async () => {
    const steps: string[] = []
    const deps = {
      extract: async () => ykbMissingRow,
      verify: async (_p: unknown, discrepancy: string) => {
        expect(discrepancy).toContain('fark')
        return {
          remove: [3], // Worldpuan satırı
          update: [],
          add: [{ ...ykbMissingRow.transactions[1], date: '2026-08-15', description: 'ADOBE CREATIVE CLOUD', merchant: 'ADOBE', amount: 1_150, category: 'Abonelikler' }],
          meta: { previous_balance: null, total_debt: null, opening_balance: null, closing_balance: null },
          notes: 'Worldpuan satırı işlem değil; ADOBE satırı atlanmıştı.',
        }
      },
      onProgress: (s: string) => steps.push(s),
    }
    const first = await runExtraction(deps, ctx)
    expect(first.draft.reconciliation.status).toBe('mismatch')
    const second = await runVerification(deps, ctx, first)
    expect(second.draft.reconciliation.status).toBe('ok')
    expect(second.draft.verification).toMatchObject({ ran: true, changes: 2, diffBefore: 1450 })
    expect(second.draft.transactions.find(t => t.description === 'ADOBE CREATIVE CLOUD')!.flags).toContain('verify_added')
    expect(second.draft.transactions.some(t => t.description.includes('WORLDPUAN'))).toBe(false)
    expect(steps).toEqual(['reading', 'bank', 'extracted', 'reconciled', 'verifying', 'verified'])
  })

  it('toplamlar tutuyorsa kontrol turu çalışmaz', async () => {
    let called = false
    const deps = { extract: async () => garantiBonus, verify: async () => ((called = true), null as never) }
    const first = await runExtraction(deps, ctx)
    await runVerification(deps, ctx, first)
    expect(called).toBe(false)
  })

  it('geçersiz indeksleri yok sayar, değiştirilen satırı işaretler', () => {
    const { parsed, flagsByIndex } = applyCorrections(garantiBonus, {
      remove: [99],
      update: [{ index: 1, date: null, amount: 2_530.4, direction: null, type: null, description: null }],
      add: [],
      meta: { previous_balance: null, total_debt: null, opening_balance: null, closing_balance: null },
      notes: '',
    })
    expect(parsed.transactions).toHaveLength(garantiBonus.transactions.length)
    const idx = parsed.transactions.findIndex(t => t.amount === 2_530.4)
    expect(flagsByIndex.get(idx)).toEqual(['verify_changed'])
  })
})
