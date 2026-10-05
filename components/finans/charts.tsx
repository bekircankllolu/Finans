'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCompactTRY, formatMonthShort, formatTRY } from '@/lib/finans/format'

// Doğrulanmış koyu tema kategorik slotları (#16151F yüzeyinde CVD ve kontrast testinden geçti)
export const SERIES = ['#3987e5', '#d95926', '#199e70'] as const
const GRID = 'rgba(255,255,255,0.06)'
const AXIS = '#8B8B9E'

type Row = { label: string; value: number; color?: string; strong?: boolean }

function TooltipBox({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0D0D14] px-3 py-2 text-xs shadow-xl min-w-[160px]">
      <div className="text-[#8B8B9E] mb-1.5">{title}</div>
      {rows.map(r => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-[#8B8B9E]">
            {r.color && <span className="inline-block w-3 h-0.5 rounded" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className={r.strong === false ? 'text-[#C3C2CF] tabular-nums' : 'text-[#F0F0F5] font-semibold tabular-nums'}>
            {formatTRY(r.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function Legend({ items, shape = 'rect' }: { items: { label: string; color: string }[]; shape?: 'rect' | 'line' }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8B8B9E] mb-3">
      {items.map(i => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span
            className={shape === 'rect' ? 'inline-block w-2.5 h-2.5 rounded-sm' : 'inline-block w-3.5 h-0.5 rounded'}
            style={{ background: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  )
}

const axisProps = {
  tick: { fill: AXIS, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const

export function IncomeExpenseChart({ data }: { data: { month: string; income: number; expense: number; net: number }[] }) {
  const rows = data.map(d => ({ ...d, label: formatMonthShort(d.month) }))
  return (
    <div>
      <Legend items={[{ label: 'Gelir', color: SERIES[0] }, { label: 'Gider', color: SERIES[1] }]} />
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
            <YAxis {...axisProps} width={56} tickFormatter={v => formatCompactTRY(Number(v))} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as (typeof rows)[number]
                return (
                  <TooltipBox
                    title={p.label}
                    rows={[
                      { label: 'Gelir', value: p.income, color: SERIES[0] },
                      { label: 'Gider', value: p.expense, color: SERIES[1] },
                      { label: 'Net', value: p.net, strong: false },
                    ]}
                  />
                )
              }}
            />
            <Bar isAnimationActive={false} dataKey="income" name="Gelir" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar isAnimationActive={false} dataKey="expense" name="Gider" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function ForecastChart({
  data,
}: {
  data: { month: string; endBalance: number; income: number; baseSpend: number; loanPayments: number; cardInstallments: number; net: number }[]
}) {
  const rows = data.map(d => ({ ...d, label: formatMonthShort(d.month) }))
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} width={56} tickFormatter={v => formatCompactTRY(Number(v))} />
          <ReferenceLine y={0} stroke="#5A5A6E" />
          <Tooltip
            cursor={{ stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as (typeof rows)[number]
              return (
                <TooltipBox
                  title={`${p.label} sonu`}
                  rows={[
                    { label: 'Net nakit', value: p.endBalance, color: SERIES[0] },
                    { label: 'Gelir', value: p.income, strong: false },
                    { label: 'Harcama', value: -p.baseSpend, strong: false },
                    { label: 'Kredi', value: -p.loanPayments, strong: false },
                    { label: 'Kart taksiti', value: -p.cardInstallments, strong: false },
                  ]}
                />
              )
            }}
          />
          <Line isAnimationActive={false} type="monotone" dataKey="endBalance" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, fill: SERIES[0], stroke: '#16151F', strokeWidth: 2 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function PayoffChart({ series }: { series: { key: string; label: string; timeline: number[] }[] }) {
  const length = Math.max(0, ...series.map(s => s.timeline.length))
  const step = Math.max(1, Math.ceil(length / 60))
  const rows: Record<string, number>[] = []
  for (let m = 0; m <= length; m += step) {
    const row: Record<string, number> = { month: m }
    for (const s of series) {
      const v = m === 0 ? s.timeline[0] : s.timeline[m - 1]
      if (v != null) row[s.key] = v
      else if (m > s.timeline.length) row[s.key] = 0
    }
    rows.push(row)
  }
  const items = series.map((s, i) => ({ label: s.label, color: SERIES[i % SERIES.length] }))

  return (
    <div>
      <Legend items={items} shape="line" />
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="month" {...axisProps} tickFormatter={v => `${v}. ay`} />
            <YAxis {...axisProps} width={56} tickFormatter={v => formatCompactTRY(Number(v))} />
            <Tooltip
              cursor={{ stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <TooltipBox
                    title={`${label}. ay kalan borç`}
                    rows={series.map((s, i) => ({ label: s.label, value: Number(payload[0].payload[s.key] ?? 0), color: SERIES[i % SERIES.length] }))}
                  />
                )
              }}
            />
            {series.map((s, i) => (
              <Line isAnimationActive={false} key={s.key} type="monotone" dataKey={s.key} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function CategoryTrendChart({ data, label }: { data: { month: string; value: number }[]; label: string }) {
  const rows = data.map(d => ({ ...d, label: formatMonthShort(d.month) }))
  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
          <YAxis {...axisProps} width={52} tickFormatter={v => formatCompactTRY(Number(v))} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox title={(payload[0].payload as (typeof rows)[number]).label} rows={[{ label, value: Number(payload[0].value), color: SERIES[0] }]} />
              ) : null
            }
          />
          <Bar isAnimationActive={false} dataKey="value" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
