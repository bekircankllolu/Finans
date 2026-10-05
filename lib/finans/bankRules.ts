import { normalizeMerchant } from './merchant'

// Banka bazlı öğrenilen kurallar: kullanıcı onay ekranında bir satırın yönünü çevirdiğinde ya da
// işlem olmadığını söyleyip çıkardığında, o bankanın sonraki ekstrelerinde aynısı otomatik yapılır.

export type BankRuleKind = 'direction' | 'exclude'

export interface BankRule {
  id?: string
  bank: string
  pattern: string
  kind: BankRuleKind
  value: 'in' | 'out' | 'true'
}

export function bankRulePattern(description: string): string {
  return normalizeMerchant(description).toLocaleLowerCase('tr-TR').slice(0, 60)
}

function matches(rule: BankRule, description: string): boolean {
  const key = bankRulePattern(description)
  return rule.pattern.length >= 3 && (key === rule.pattern || key.includes(rule.pattern))
}

export interface RuleTarget {
  description: string
  direction: 'in' | 'out'
  include: boolean
  flags: string[]
}

export function applyBankRules<T extends RuleTarget>(rows: T[], rules: BankRule[], bank: string | null): T[] {
  const relevant = bank ? rules.filter(r => r.bank === bank) : []
  if (!relevant.length) return rows
  return rows.map(row => {
    let next = row
    for (const rule of relevant) {
      if (!matches(rule, row.description)) continue
      if (rule.kind === 'exclude' && next.include) {
        next = { ...next, include: false, flags: [...next.flags, 'bank_rule_excluded'] }
      }
      if (rule.kind === 'direction' && (rule.value === 'in' || rule.value === 'out') && next.direction !== rule.value) {
        next = { ...next, direction: rule.value, flags: [...next.flags, 'bank_rule_direction'] }
      }
    }
    return next
  })
}

export interface LearnInput {
  description: string
  direction: 'in' | 'out'
  ai_direction: 'in' | 'out'
  include: boolean
  duplicate: boolean
  flags: string[]
}

// Onayda: AI'nın yönünü kullanıcı değiştirdiyse yön kuralı; kullanıcı "hariç tut" kuralını
// istediyse (learnExclusions) tekrar olmayan, çıkarılmış satırlardan hariç tutma kuralı üretir.
export function learnBankRules(bank: string | null, rows: LearnInput[], learnExclusions: boolean): BankRule[] {
  if (!bank) return []
  const out = new Map<string, BankRule>()
  for (const row of rows) {
    const pattern = bankRulePattern(row.description)
    if (pattern.length < 3) continue
    if (row.include && row.direction !== row.ai_direction && !row.flags.includes('bank_rule_direction')) {
      out.set(`direction|${pattern}`, { bank, pattern, kind: 'direction', value: row.direction })
    }
    if (learnExclusions && !row.include && !row.duplicate && !row.flags.includes('bank_rule_excluded')) {
      out.set(`exclude|${pattern}`, { bank, pattern, kind: 'exclude', value: 'true' })
    }
  }
  return [...out.values()]
}

export function bankRulesForPrompt(rules: BankRule[]): string {
  return rules
    .slice(0, 40)
    .map(r =>
      r.kind === 'exclude'
        ? `- Açıklaması "${r.pattern}" içeren satırlar gerçek işlem değildir, listeye alma.`
        : `- Açıklaması "${r.pattern}" içeren satırların yönü "${r.value}"dir.`,
    )
    .join('\n')
}
