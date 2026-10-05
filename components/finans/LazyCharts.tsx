'use client'

import dynamic from 'next/dynamic'

// Recharts büyük bir paket; sayfanın geri kalanı hemen gelsin, grafikler ayrı yüklensin.
// Yer tutucular grafiklerle aynı yükseklikte, böylece sayfa kaymaz.
const placeholder = (height: string) => {
  function ChartPlaceholder() {
    return <div className={`skeleton rounded-xl ${height}`} />
  }
  return ChartPlaceholder
}

export const IncomeExpenseChart = dynamic(() => import('./charts').then(m => m.IncomeExpenseChart), {
  ssr: false,
  loading: placeholder('h-[284px]'),
})

export const ForecastChart = dynamic(() => import('./charts').then(m => m.ForecastChart), {
  ssr: false,
  loading: placeholder('h-56'),
})

export const PayoffChart = dynamic(() => import('./charts').then(m => m.PayoffChart), {
  ssr: false,
  loading: placeholder('h-[252px]'),
})

export const CategoryTrendChart = dynamic(() => import('./charts').then(m => m.CategoryTrendChart), {
  ssr: false,
  loading: placeholder('h-40'),
})
