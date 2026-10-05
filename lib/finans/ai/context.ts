import type { Snapshot } from '../calc/snapshot'
import type { FinanceData } from '../types'
import { ACCOUNT_TYPE_LABELS } from '../defaults'

const r = (n: number | null | undefined) => (n == null ? null : Math.round(n))

// Modele gönderilen özet: hesaplanmış rakamlar, yuvarlanmış ve kategori adlarıyla.
// AI rakam üretmez, bu tabloyu yorumlar.
export function snapshotForAI(s: Snapshot, data: FinanceData) {
  const catName = new Map(data.categories.map(c => [c.id, c.name]))
  return {
    bugun: s.today,
    odak_ay: s.focusMonth,
    finansal_saglik_skoru: s.health.score,
    saglik_faktorleri: s.health.factors.map(f => ({ ad: f.label, deger: f.value, puan: Math.round(f.score * 100) })),
    net_deger: {
      likit: r(s.netWorth.liquid),
      yatirim: r(s.netWorth.investments),
      kart_borcu: r(s.netWorth.cardDebt),
      kmh_borcu: r(s.netWorth.kmhDebt),
      kredi_borcu: r(s.netWorth.loanDebt),
      net: r(s.netWorth.netWorth),
      kuru_bilinmeyen_kalemler: s.netWorth.unpriced,
    },
    aylik_ozet_son_12_ay: s.months
      .filter(m => m.txCount > 0)
      .map(m => ({ ay: m.month, gelir: r(m.income), gider: r(m.expense), net: r(m.net), sabit_gider: r(m.fixedExpense) })),
    odak_ay_kategoriler: s.breakdown.map(b => ({
      kategori: b.name,
      tutar: r(b.amount),
      pay_yuzde: Math.round(b.share * 100),
      onceki_ay: r(b.prevAmount),
      uc_ay_ort: r(b.avg3),
    })),
    kredi_kartlari: s.cards.map(c => ({
      ad: c.account.name,
      banka: c.account.bank,
      borc: r(c.balance),
      limit: r(c.limit),
      limit_kullanim_yuzde: c.utilization == null ? null : Math.round(c.utilization * 100),
      son_odeme: c.dueDate,
      asgari: r(c.minPayment),
      aylik_faiz_yuzde: c.account.monthly_rate,
    })),
    kmh: s.kmh.map(a => ({ ad: a.name, borc: r(a.balance), aylik_faiz_yuzde: a.monthly_rate })),
    krediler: s.loans.map(l => ({
      ad: l.loan.name,
      banka: l.loan.bank,
      aylik_faiz_yuzde: l.loan.monthly_rate,
      aylik_taksit: r(l.monthlyPayment),
      odenen_taksit: l.paidCount,
      kalan_taksit: l.remainingCount,
      kalan_anapara: r(l.remainingPrincipal),
      kalan_faiz_vergi: r(l.remainingInterest),
      bitis: l.endDate,
      erken_kapama_tutari: r(l.earlyPayoffAmount),
      erken_kapama_kazanci: r(l.earlyPayoffSavings),
    })),
    kart_taksitleri: s.installments.map(p => ({
      isyeri: p.merchant,
      aylik: r(p.monthlyAmount),
      kalan_taksit: p.remainingCount,
      kalan_tutar: r(p.remainingAmount),
      bitis_ayi: p.endMonth,
    })),
    duzenli_odemeler: s.recurring.map(x => ({ isyeri: x.merchant, aylik_ort: r(x.avgAmount), ay_sayisi: x.months, yillik: r(x.yearlyCost) })),
    gelir_kaynaklari: data.incomes
      .filter(i => i.is_active)
      .map(i => ({ ad: i.name, tur: i.kind, tutar: i.amount, para_birimi: i.currency, duzenli: i.is_recurring })),
    duzenli_aylik_gelir_tl: r(s.recurringIncome),
    taban_aylik_harcama_tl: r(s.baseSpend),
    nakit_akisi_tahmini_6_ay: s.forecast.map(f => ({
      ay: f.month,
      gelir: r(f.income),
      taban_gider: r(f.baseSpend),
      kredi: r(f.loanPayments),
      kart_taksit: r(f.cardInstallments),
      net: r(f.net),
      ay_sonu_net_nakit: r(f.endBalance),
    })),
    borc_stratejileri: {
      onerilen_ekstra_odeme: s.suggestedExtra,
      sadece_asgari: { ay: s.strategies.minimum.months, toplam_faiz: r(s.strategies.minimum.totalInterest), mumkun: s.strategies.minimum.feasible },
      cig: { ay: s.strategies.avalanche.months, toplam_faiz: r(s.strategies.avalanche.totalInterest), sira: s.strategies.avalanche.payoffOrder.map(p => p.name) },
      kartopu: { ay: s.strategies.snowball.months, toplam_faiz: r(s.strategies.snowball.totalInterest), sira: s.strategies.snowball.payoffOrder.map(p => p.name) },
    },
    butceler: s.budgets.map(b => ({
      kategori: b.categoryName,
      limit: r(b.budget.monthly_limit),
      harcanan: r(b.spent),
      ay_sonu_tahmini: r(b.projected),
    })),
    hedefler: s.goals.map(g => ({
      ad: g.goal.name,
      hedef: r(g.goal.target_amount),
      mevcut: r(g.goal.current_amount),
      hedef_tarih: g.goal.target_date,
      gereken_aylik: r(g.requiredMonthly),
    })),
    hesaplar: data.accounts
      .filter(a => a.is_active)
      .map(a => ({ ad: a.name, tur: ACCOUNT_TYPE_LABELS[a.type], banka: a.bank, bakiye: r(a.balance), para_birimi: a.currency })),
    uyarilar: s.alerts.map(a => `${a.title}: ${a.message}`),
    kategori_listesi: [...new Set(catName.values())],
  }
}
