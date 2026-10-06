import { describe, expect, it } from 'vitest'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { loanSchema, normalizeStatementOutput, statementOutputSchema, statementSchema, verifySchema } from '../schemas'
import { CATEGORIES, garantiBonus } from '../../__tests__/fixtures'

const names = CATEGORIES.map(category => category.name)

// Inspect the actual SDK-generated schema, including nested transactions/$defs.
function unions(value: unknown): number {
  if (!value || typeof value !== 'object') return 0
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + unions(item), 0)
  const schema = value as Record<string, unknown>
  const union = Array.isArray(schema.type) || Array.isArray(schema.anyOf) ? 1 : 0
  return union + Object.values(schema).reduce<number>((sum, item) => sum + unions(item), 0)
}

describe('Anthropic structured statement output', () => {
  it('keeps every AI output schema within the API union limit', () => {
    expect(unions(zodOutputFormat(statementSchema(names)).schema)).toBeGreaterThan(16)
    for (const schema of [statementOutputSchema(names), verifySchema(names), loanSchema]) {
      expect(unions(zodOutputFormat(schema).schema)).toBeLessThanOrEqual(16)
    }
  })
  it('normalizes omitted metadata to null without losing transactions or amounts', () => {
    const output = statementOutputSchema(names).parse({ ...garantiBonus, bank: undefined, card_brand: undefined, account_name: undefined, last4: undefined, transactions: garantiBonus.transactions.map(tx => ({ ...tx, original_currency: undefined })) })
    const parsed = normalizeStatementOutput(output, names)
    expect(parsed.bank).toBeNull()
    expect(parsed.card_brand).toBeNull()
    expect(parsed.account_name).toBeNull()
    expect(parsed.last4).toBeNull()
    expect(parsed.transactions.map(tx => tx.amount)).toEqual(garantiBonus.transactions.map(tx => tx.amount))
    expect(parsed.transactions.every(tx => tx.original_currency === null)).toBe(true)
    expect(parsed.previous_balance).toBe(garantiBonus.previous_balance)
    expect(parsed.opening_balance).toBe(garantiBonus.opening_balance)
  })
  it('preserves known metadata and foreign currency values', () => {
    const source = { ...garantiBonus, transactions: garantiBonus.transactions.map(tx => ({ ...tx, original_currency: 'USD', original_amount: 12.99 })) }
    expect(normalizeStatementOutput(statementOutputSchema(names).parse(source), names)).toEqual(source)
  })
  it('rejects invalid financial values instead of coercing them', () => {
    expect(() => statementOutputSchema(names).parse({ ...garantiBonus, transactions: [{ ...garantiBonus.transactions[0], amount: 'invalid' }] })).toThrow()
  })
})
