// DB satır tipleri (supabase/finans_schema.sql ile birebir)

export type AccountType = 'credit_card' | 'checking' | 'kmh' | 'savings' | 'investment' | 'cash'
export type CategoryKind = 'expense' | 'income' | 'transfer'
export type Direction = 'in' | 'out'
export type AssetCode = 'TRY' | 'USD' | 'EUR' | 'GBP' | 'XAU' | 'FUND' | 'BES' | 'STOCK' | 'OTHER'
export type IncomeKind = 'salary' | 'freelance' | 'rent' | 'other'

export interface Account {
  id: string
  type: AccountType
  bank: string | null
  name: string
  currency: string
  last4: string | null
  credit_limit: number | null
  balance: number
  balance_updated_at: string | null
  statement_day: number | null
  due_day: number | null
  monthly_rate: number | null
  is_active: boolean
}

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  color: string
  is_fixed: boolean
  sort: number
}

export interface Transaction {
  id: string
  account_id: string | null
  statement_id: string | null
  date: string // YYYY-MM-DD
  description: string
  merchant: string
  amount: number
  direction: Direction
  currency: string
  amount_try: number
  category_id: string | null
  installment_no: number | null
  installment_total: number | null
  source: 'statement' | 'manual'
  notes: string | null
}

export interface Statement {
  id: string
  account_id: string | null
  kind: 'bank_statement' | 'loan_schedule'
  file_name: string
  mime_type: string
  status: 'uploaded' | 'parsing' | 'parsed' | 'confirmed' | 'failed'
  period_start: string | null
  period_end: string | null
  due_date: string | null
  total_debt: number | null
  min_payment: number | null
  closing_balance: number | null
  error: string | null
  created_at: string
  confirmed_at: string | null
}

export interface Loan {
  id: string
  name: string
  bank: string | null
  principal: number
  monthly_rate: number
  term_months: number
  first_due_date: string
  include_taxes: boolean
}

export interface LoanInstallment {
  id?: string
  loan_id: string
  no: number
  due_date: string
  principal: number
  interest: number
  tax: number
  total: number
  remaining_principal: number
  paid: boolean
}

export interface IncomeSource {
  id: string
  name: string
  kind: IncomeKind
  amount: number
  currency: string
  day_of_month: number | null
  is_recurring: boolean
  is_active: boolean
}

export interface Holding {
  id: string
  name: string
  asset: AssetCode
  quantity: number
  unit_price_try: number | null
  updated_at: string
}

export interface Budget {
  id: string
  category_id: string
  monthly_limit: number
}

export interface Goal {
  id: string
  name: string
  target_amount: number
  current_amount: number
  target_date: string | null
}

export type FxRates = Partial<Record<AssetCode, number>>

export interface FinanceData {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  statements: Statement[]
  loans: Loan[]
  installments: LoanInstallment[]
  incomes: IncomeSource[]
  holdings: Holding[]
  budgets: Budget[]
  goals: Goal[]
  fx: FxRates
  dismissed: string[]
}

// AI parser'ın ürettiği, onay ekranında düzenlenen taslak işlem
export interface DraftTransaction {
  tempId: string
  date: string
  description: string
  merchant: string
  amount: number
  direction: Direction
  currency: string
  category_id: string | null
  ai_category_id: string | null
  installment_no: number | null
  installment_total: number | null
  duplicate: boolean
  include: boolean
}

export interface DraftStatement {
  meta: {
    bank: string | null
    account_type: AccountType
    account_name: string | null
    last4: string | null
    currency: string
    period_start: string | null
    period_end: string | null
    due_date: string | null
    total_debt: number | null
    min_payment: number | null
    closing_balance: number | null
    credit_limit: number | null
  }
  transactions: DraftTransaction[]
  warnings: string[]
}

export interface DraftLoanSchedule {
  meta: {
    bank: string | null
    name: string | null
    principal: number | null
    monthly_rate: number | null
    term_months: number | null
  }
  installments: Omit<LoanInstallment, 'loan_id' | 'id'>[]
  warnings: string[]
}
