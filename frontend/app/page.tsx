'use client'

import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { OwnerTabs } from '../components/OwnerTabs'
import { ThemeToggle } from '../components/ThemeToggle'
import { PrivacyToggle } from '../components/PrivacyToggle'
import { MaskedValue } from '../components/MaskedValue'
import { Card, CardContent } from '../components/ui/card'
import { API, CAT_ICON, OwnerScope, THEME, card, heatColor, won } from '../lib/ui'

export default function Page() {
  const householdId = 1
  const [activeTab, setActiveTab] = useState<'calendar' | 'insights'>('calendar')
  const [ownerScope, setOwnerScope] = useState<OwnerScope>('self')
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [privacyMasked, setPrivacyMasked] = useState(true)
  const [rows, setRows] = useState<any[]>([])
  const [monthly, setMonthly] = useState<any[]>([])
  const [daily, setDaily] = useState<any[]>([])
  const [expenseShare, setExpenseShare] = useState<any[]>([])
  const [incomeShare, setIncomeShare] = useState<any[]>([])
  const [holdings, setHoldings] = useState<any[]>([])
  const [holdingForm, setHoldingForm] = useState({ assetClass: 'stock', symbol: '', displayName: '', quantity: '', avgBuyPrice: '', currency: 'KRW' })
  const [bs, setBs] = useState<any>({ assets: [], liabilities: [], assetsTotal: 0, liabilitiesTotal: 0 })
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [dayReport, setDayReport] = useState<any>(null)

  const rowsSafe = Array.isArray(rows) ? rows : []
  const monthlySafe = Array.isArray(monthly) ? monthly : []
  const dailySafe = Array.isArray(daily) ? daily : []
  const latestNetWorth = useMemo(() => rowsSafe?.[rowsSafe.length - 1]?.netWorth ?? 0, [rowsSafe])
  const latestMonth = useMemo(() => monthlySafe?.[monthlySafe.length - 1] || null, [monthlySafe])
  const assetsTotal = Number(bs?.assetsTotal || 0)
  const liabilitiesTotal = Number(bs?.liabilitiesTotal || 0)
  const monthOptions = useMemo(() => monthlySafe.map((m: any) => m.month), [monthlySafe])
  const dailyMap = useMemo(() => {
    const m: Record<string, any> = {}
    for (const d of dailySafe) m[d.date] = d
    return m
  }, [dailySafe])
  const maxAbsDailyNet = useMemo(() => {
    let max = 0
    for (const d of dailySafe) max = Math.max(max, Math.abs(Number(d.net || 0)))
    return max
  }, [dailySafe])

  const mergedCategories = useMemo(() => {
    const incomeSafe = Array.isArray(incomeShare) ? incomeShare : []
    const expenseSafe = Array.isArray(expenseShare) ? expenseShare : []
    const a = incomeSafe.map((x: any) => ({ ...x, type: '수입' }))
    const b = expenseSafe.map((x: any) => ({ ...x, type: '지출' }))
    return [...a, ...b].sort((x, y) => Number(y.amount) - Number(x.amount))
  }, [incomeShare, expenseShare])

  const holdingsSafe = Array.isArray(holdings) ? holdings : []
  const holdingClassSummary = useMemo(() => {
    const labels: Record<string, string> = { stock: '주식', etf: 'ETF', crypto: '코인' }
    const acc = new Map<string, number>()
    for (const h of holdingsSafe) acc.set(h.assetClass, (acc.get(h.assetClass) || 0) + 1)
    return Array.from(acc.entries()).map(([k, v]) => ({ key: k, label: labels[k] || k, count: v }))
  }, [holdingsSafe])

  const recentTransactions = useMemo(() => (dayReport?.transactions || []).slice(0, 5), [dayReport])

  const calendarDays = useMemo(() => {
    if (!selectedMonth || !/^\d{4}-\d{2}$/.test(selectedMonth)) return [] as any[]
    const y = Number(selectedMonth.slice(0, 4))
    const mo = Number(selectedMonth.slice(5, 7))
    const firstWeekday = new Date(y, mo - 1, 1).getDay()
    const lastDay = new Date(y, mo, 0).getDate()
    const out: any[] = []
    for (let i = 0; i < firstWeekday; i++) out.push({ empty: true, key: `e${i}` })
    for (let day = 1; day <= lastDay; day++) {
      const iso = `${selectedMonth}-${String(day).padStart(2, '0')}`
      out.push({ day, iso, ...(dailyMap[iso] || { income: 0, expense: 0, net: 0 }) })
    }
    return out
  }, [selectedMonth, dailyMap])

  async function bootstrap() { await fetch(`${API}/local/bootstrap`, { method: 'POST' }) }

  function qs() {
    return new URLSearchParams({ owner_scope: ownerScope }).toString()
  }

  async function recompute() {
    await fetch(`${API}/snapshots/recompute?household_id=${householdId}`, { method: 'POST' })
    await Promise.all([refresh(), loadBalanceSheet(), loadMonthly(), loadHoldings()])
  }

  async function refresh() {
    const r = await fetch(`${API}/households/${householdId}/net-worth?${qs()}`)
    const j = await r.json()
    setRows(Array.isArray(j) ? j : [])
  }

  async function loadMonthly() {
    const r = await fetch(`${API}/households/${householdId}/cashflow/monthly?${qs()}`)
    const j = await r.json()
    setMonthly(Array.isArray(j) ? j : [])
  }

  async function loadDailyCashflow(monthKey: string) {
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return
    const y = Number(monthKey.slice(0, 4))
    const m = Number(monthKey.slice(5, 7))
    const r = await fetch(`${API}/households/${householdId}/cashflow/daily?year=${y}&month=${m}&${qs()}`)
    const j = await r.json()
    setDaily(Array.isArray(j) ? j : [])
  }

  async function loadDailyReport(day: string) {
    const r = await fetch(`${API}/households/${householdId}/cashflow/daily-report?day=${encodeURIComponent(day)}&${qs()}`)
    setDayReport(await r.json())
  }

  async function loadBalanceSheet() {
    const r = await fetch(`${API}/households/${householdId}/balance-sheet?${qs()}`)
    const j = await r.json()
    setBs(j && typeof j === 'object' ? j : { assets: [], liabilities: [], assetsTotal: 0, liabilitiesTotal: 0 })
  }

  async function loadHoldings() {
    const r = await fetch(`${API}/households/${householdId}/holdings?${qs()}`)
    const j = await r.json()
    setHoldings(Array.isArray(j) ? j : [])
  }

  async function submitHolding(e: React.FormEvent) {
    e.preventDefault()
    if (!holdingForm.symbol.trim() || !holdingForm.displayName.trim() || !holdingForm.quantity) return
    const payload = {
      household_id: householdId,
      owner_scope: ownerScope === 'all' ? 'self' : ownerScope,
      asset_class: holdingForm.assetClass,
      symbol: holdingForm.symbol.trim().toUpperCase(),
      display_name: holdingForm.displayName.trim(),
      quantity: Number(holdingForm.quantity),
      avg_buy_price: holdingForm.avgBuyPrice ? Number(holdingForm.avgBuyPrice) : null,
      currency: holdingForm.currency,
      source: 'manual',
    }
    const r = await fetch(`${API}/holdings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!r.ok) {
      const t = await r.text()
      alert(`holding 저장 실패: ${t}`)
      return
    }
    setHoldingForm({ assetClass: 'stock', symbol: '', displayName: '', quantity: '', avgBuyPrice: '', currency: 'KRW' })
    await loadHoldings()
  }

  async function loadCategoryShare(monthKey?: string) {
    let y: number, m: number
    if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) {
      y = Number(monthKey.slice(0, 4)); m = Number(monthKey.slice(5, 7))
    } else {
      const now = new Date(); y = now.getFullYear(); m = now.getMonth() + 1
    }

    const e = await fetch(`${API}/households/${householdId}/category-share?year=${y}&month=${m}&tx_type=지출&${qs()}`)
    const i = await fetch(`${API}/households/${householdId}/category-share?year=${y}&month=${m}&tx_type=수입&${qs()}`)
    const ej = await e.json(); const ij = await i.json()
    setExpenseShare(ej?.items || []); setIncomeShare(ij?.items || [])
  }

  async function uploadXlsx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const fd = new FormData(); fd.append('file', file)
    const r = await fetch(`${API}/imports/xlsx-local`, { method: 'POST', body: fd })
    const j = await r.json()
    alert(`업로드 완료: 거래 ${j.imported}건 / 중복 ${j.skipped_duplicates}건`)
    await recompute()
  }

  useEffect(() => { bootstrap().then(recompute).catch(console.error) }, [])
  useEffect(() => { Promise.all([refresh(), loadBalanceSheet(), loadMonthly(), loadHoldings()]).catch(console.error) }, [ownerScope])

  useEffect(() => {
    if (!monthOptions.length) return
    const current = selectedMonth && monthOptions.includes(selectedMonth) ? selectedMonth : monthOptions[monthOptions.length - 1]
    if (selectedMonth !== current) setSelectedMonth(current)
    Promise.all([loadCategoryShare(current), loadDailyCashflow(current)]).catch(console.error)
  }, [monthOptions, selectedMonth, ownerScope])

  useEffect(() => {
    if (!selectedDate && calendarDays.length) {
      const first = calendarDays.find((d: any) => d.iso)?.iso
      if (first) setSelectedDate(first)
    }
  }, [calendarDays, selectedDate])

  useEffect(() => {
    if (selectedDate) loadDailyReport(selectedDate).catch(console.error)
  }, [selectedDate, ownerScope])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <main className={theme === 'dark' ? 'min-h-screen bg-[#0b0f14] px-4 py-4 text-slate-100' : 'min-h-screen bg-slate-100 px-4 py-4 text-slate-900'} style={{ fontFamily: 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", Inter, sans-serif' }}>
      <section className={theme === 'dark' ? 'mb-4 overflow-hidden rounded-[28px] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(17,24,39,0.94),rgba(15,23,42,0.88))] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.28)] sm:p-6' : 'mb-4 overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-5 shadow-xl shadow-slate-200/60 sm:p-6'}>
        <div className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
          <div className='space-y-3'>
            <div className={theme === 'dark' ? 'inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-300' : 'inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-700'}>Family Wealth Dashboard</div>
            <div>
              <h1 className='m-0 text-2xl font-semibold tracking-tight sm:text-3xl'>개인 재무 대시보드</h1>
              <p className={theme === 'dark' ? 'mt-2 max-w-xl text-sm text-slate-300' : 'mt-2 max-w-xl text-sm text-slate-700'}>자산, 부채, 순자산과 이번 달 흐름을 먼저 보여주는 개인 재무 홈.</p>
            </div>
          </div>
          <div className='flex flex-col items-stretch gap-3 sm:items-end'>
            <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
            <PrivacyToggle masked={privacyMasked} onToggle={() => setPrivacyMasked((v) => !v)} />
            <OwnerTabs value={ownerScope} onChange={setOwnerScope} />
          </div>
        </div>
        <div className='mt-4 flex flex-wrap items-center gap-2'>
          <button onClick={() => setActiveTab('calendar')} className={activeTab === 'calendar' ? 'rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-white/90' : 'rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10'}>현금흐름</button>
          <button onClick={() => setActiveTab('insights')} className={activeTab === 'insights' ? 'rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-white/90' : 'rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10'}>재무 인사이트</button>
          <button onClick={bootstrap} className='rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10'>로컬 초기화</button>
          <button onClick={recompute} className='rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10'>전체 재계산</button>
          <input type='file' accept='.xlsx' onChange={uploadXlsx} className='max-w-[220px] text-xs text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-cyan-400/15 file:px-3 file:py-2 file:text-cyan-100 hover:file:bg-cyan-400/25' />
        </div>
      </section>

      <section className='mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        <Card className={theme === 'dark' ? 'border-white/10 bg-white/[0.04]' : 'border-slate-200 bg-white'}>
          <CardContent className='p-5'>
            <div className='text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400'>자산 총액</div>
            <div className='mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-[2rem]'><MaskedValue value={won(assetsTotal)} masked={privacyMasked} /></div>
            <div className='mt-2 text-sm text-emerald-600 dark:text-emerald-400'>보유 자산 기준</div>
          </CardContent>
        </Card>
        <Card className={theme === 'dark' ? 'border-white/[0.05] bg-[#121821] shadow-[0_8px_24px_rgba(0,0,0,0.18)]' : 'border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]'}>
          <CardContent className='p-5'>
            <div className='text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400'>부채 총액</div>
            <div className='mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-[2rem]'><MaskedValue value={won(liabilitiesTotal)} masked={privacyMasked} /></div>
            <div className='mt-2 text-sm text-rose-400/90'>대출 및 기타 부채</div>
          </CardContent>
        </Card>
        <Card className={theme === 'dark' ? 'border-white/[0.05] bg-[#121821] shadow-[0_8px_24px_rgba(0,0,0,0.18)]' : 'border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]'}>
          <CardContent className='p-5'>
            <div className='text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400'>순자산</div>
            <div className='mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-[2rem]'><MaskedValue value={won(latestNetWorth)} masked={privacyMasked} /></div>
            <div className='mt-2 text-sm text-cyan-600 dark:text-cyan-400'>자산 - 부채</div>
          </CardContent>
        </Card>
        <Card className={theme === 'dark' ? 'border-white/[0.05] bg-[#121821] shadow-[0_8px_24px_rgba(0,0,0,0.18)]' : 'border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]'}>
          <CardContent className='p-5'>
            <div className='text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400'>이번 달 순현금흐름</div>
            <div className='mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-[2rem]'><MaskedValue value={won(latestMonth?.cashflow || 0)} masked={privacyMasked} /></div>
            <div className='mt-2 text-sm text-slate-300'>이번 달 기준</div>
          </CardContent>
        </Card>
      </section>

      <section className='mb-5 grid grid-cols-1 gap-3 xl:grid-cols-[1.4fr,1fr]'>
        <Card className={theme === 'dark' ? 'border-white/[0.05] bg-[#121821] shadow-[0_8px_24px_rgba(0,0,0,0.18)]' : 'border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]'}>
          <CardContent className='p-5 sm:p-6'>
            <div className='mb-3 flex items-center justify-between'>
              <h3 className='text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-lg'>최근 기록</h3>
              <span className='text-xs text-muted-foreground'>최근 5건</span>
            </div>
            <div className='max-h-72 overflow-auto pr-1'>
              {recentTransactions.length ? recentTransactions.map((t: any, i: number) => {
                const isIncome = t.type === '수입'
                return (
                  <div key={i} className={theme === 'dark' ? 'flex items-center justify-between gap-3 rounded-2xl border border-white/[0.04] bg-white/[0.02] px-3 py-3 mb-2 last:mb-0' : 'flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-3 mb-2 last:mb-0'}>
                    <div>
                      <div className='font-semibold text-slate-900 dark:text-slate-100'>{t.content || t.category}</div>
                      <div className={theme === 'dark' ? 'text-xs text-slate-300' : 'text-xs text-slate-300'}>{CAT_ICON[t.category] || '📌'} {t.category} · {t.ownerScope}</div>
                    </div>
                    <div className='text-right tabular-nums min-w-[88px]'>
                      <div className={isIncome ? 'font-bold text-rose-400' : 'font-bold text-blue-400'}>{isIncome ? '+' : '-'}<MaskedValue value={won(Math.abs(t.amount || 0))} masked={privacyMasked} /></div>
                    </div>
                  </div>
                )
              }) : <div className={theme === 'dark' ? 'text-sm text-slate-300' : 'text-sm text-slate-300'}>선택한 날짜의 거래가 아직 없어요.</div>}
            </div>
          </CardContent>
        </Card>

        <Card className={theme === 'dark' ? 'border-white/[0.05] bg-[#121821] shadow-[0_8px_24px_rgba(0,0,0,0.18)]' : 'border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]'}>
          <CardContent className='p-5 sm:p-6'>
            <div className='mb-3 flex items-center justify-between'>
              <h3 className='text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-lg'>선택일 요약</h3>
              <span className='text-xs text-muted-foreground'>{dayReport?.date || selectedDate || '-'}</span>
            </div>
            <div className='mb-1 text-sm font-medium text-rose-500 dark:text-rose-400'>수입 <MaskedValue value={won(dayReport?.income || 0)} masked={privacyMasked} /></div>
            <div className='mb-1 text-sm font-medium text-blue-600 dark:text-blue-400'>지출 <MaskedValue value={won(dayReport?.expense || 0)} masked={privacyMasked} /></div>
            <div className='mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100'>순흐름 <MaskedValue value={won(dayReport?.net || 0)} masked={privacyMasked} /></div>
            <div className='grid gap-2.5'>
              {(dayReport?.categories || []).slice(0, 5).map((c: any, i: number) => (
                <div key={i} className={theme === 'dark' ? 'flex justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm' : 'flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm'}>
                  <span>{CAT_ICON[c.category] || '📌'} {c.category}</span>
                  <b><MaskedValue value={won(c.amount)} masked={privacyMasked} /></b>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {activeTab === 'calendar' ? (
        <section className='grid grid-cols-1 gap-3 xl:grid-cols-[2fr,1fr]'>
          <Card className={theme === 'dark' ? 'border-white/[0.05] bg-[#121821] shadow-[0_8px_24px_rgba(0,0,0,0.18)]' : 'border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]'}>
            <CardContent className='p-5'>
              <div className='mb-3 flex items-center justify-between gap-3'>
                <h3 className='text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50'>현금흐름 달력</h3>
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className={theme === 'dark' ? 'rounded-xl border border-white/[0.06] bg-[#0f141c] px-3 py-2 text-sm text-slate-200' : 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700'}>
                  {monthOptions.map((m: string) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className='grid grid-cols-7 gap-2.5'>
                {['일', '월', '화', '수', '목', '금', '토'].map((d) => <div key={d} className={theme === 'dark' ? 'text-center text-xs text-slate-700' : 'text-center text-xs text-slate-300'}>{d}</div>)}
                {calendarDays.map((d: any) => {
                  if (d.empty) return <div key={d.key} />
                  const hc = heatColor(Number(d.net || 0), maxAbsDailyNet, theme)
                  return (
                    <button key={d.iso} onClick={() => setSelectedDate(d.iso)} className={theme === 'dark' ? 'min-h-[78px] rounded-[20px] border border-white/[0.07] p-2.5 text-left transition hover:border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]' : 'min-h-[76px] rounded-2xl border border-slate-200 p-2 text-left transition hover:border-cyan-400/40'} style={{ background: hc.bg }}>
                      <div style={{ color: hc.text }} className='mb-1 text-[11px] font-semibold tracking-tight'>{d.day}</div>
                      {d.net !== 0 && <div style={{ color: hc.text }} className='text-[11px]'><MaskedValue value={won(d.net)} masked={privacyMasked} /></div>}
                      {d.income > 0 && <div style={{ color: hc.text }} className='text-[10px]'>+<MaskedValue value={won(d.income)} masked={privacyMasked} /></div>}
                      {d.expense > 0 && <div style={{ color: hc.text }} className='text-[10px]'>-<MaskedValue value={won(d.expense)} masked={privacyMasked} /></div>}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card className={theme === 'dark' ? 'border-white/[0.05] bg-[#121821] shadow-[0_8px_24px_rgba(0,0,0,0.18)]' : 'border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]'}>
            <CardContent className='p-5'>
              <h3 className='mb-3 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50'>월 카테고리</h3>
              <div className='grid gap-2'>
                {mergedCategories.slice(0, 10).map((c: any, i: number) => {
                  const isIncome = c.type === '수입'
                  const color = isIncome ? THEME.income : THEME.expense
                  const bg = isIncome ? THEME.incomeSoft : THEME.expenseSoft
                  return (
                    <div key={i} className={theme === 'dark' ? 'rounded-2xl border border-white/[0.05] bg-white/[0.03] p-3' : 'rounded-2xl border border-slate-100 bg-slate-50 p-3'}>
                      <div className='flex items-center justify-between gap-3 text-sm'>
                        <span className={theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}>{CAT_ICON[c.category] || '📌'} {c.category}</span>
                        <b style={{ color }} className='tabular-nums'>{isIncome ? '+' : '-'}<MaskedValue value={won(c.amount)} masked={privacyMasked} /></b>
                      </div>
                      <div className='mt-2 h-2 rounded-full' style={{ background: bg }}>
                        <div style={{ width: `${Math.min(100, c.weight)}%`, height: 8, background: color, borderRadius: 999 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </section>
      ) : (
        <section className='grid grid-cols-1 gap-3 xl:grid-cols-3'>
          <Card className={theme === 'dark' ? 'border-white/[0.05] bg-[#121821] shadow-[0_8px_24px_rgba(0,0,0,0.18)] xl:col-span-2' : 'border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)] xl:col-span-2'}>
            <CardContent className='p-5'>
              <h3 className='mb-3 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50'>순자산 추이</h3>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <LineChart data={rowsSafe}>
                    <CartesianGrid strokeDasharray='3 3' stroke={theme === 'dark' ? 'rgba(255,255,255,0.05)' : '#e2e8f0'} />
                    <XAxis dataKey='date' tick={{ fontSize: 11, fill: theme === 'dark' ? '#64748b' : '#64748b' }} minTickGap={24} />
                    <YAxis width={92} tickFormatter={(v) => won(Number(v))} tick={{ fontSize: 11, fill: theme === 'dark' ? '#64748b' : '#64748b' }} />
                    <Tooltip formatter={(v: any) => won(Number(v))} />
                    <Line type='monotone' dataKey='netWorth' stroke='#10b981' strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className={theme === 'dark' ? 'border-white/[0.05] bg-[#121821] shadow-[0_8px_24px_rgba(0,0,0,0.18)]' : 'border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]'}>
            <CardContent className='p-5'>
              <h3 className='mb-3 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50'>보유 투자자산</h3>
              <form onSubmit={submitHolding} className={theme === 'dark' ? 'mb-4 grid gap-2 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3' : 'mb-4 grid gap-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-3'}>
                <div className='grid grid-cols-2 gap-2'>
                  <select value={holdingForm.assetClass} onChange={(e) => setHoldingForm((f) => ({ ...f, assetClass: e.target.value }))} className={theme === 'dark' ? 'rounded-xl border border-white/[0.06] bg-[#0f141c] px-3 py-2 text-sm text-slate-200' : 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700'}>
                    <option value='stock'>주식</option>
                    <option value='etf'>ETF</option>
                    <option value='crypto'>코인</option>
                  </select>
                  <input value={holdingForm.symbol} onChange={(e) => setHoldingForm((f) => ({ ...f, symbol: e.target.value }))} placeholder='심볼' className={theme === 'dark' ? 'rounded-xl border border-white/[0.06] bg-[#0f141c] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500' : 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400'} />
                </div>
                <input value={holdingForm.displayName} onChange={(e) => setHoldingForm((f) => ({ ...f, displayName: e.target.value }))} placeholder='표시 이름' className={theme === 'dark' ? 'rounded-xl border border-white/[0.06] bg-[#0f141c] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500' : 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400'} />
                <div className='grid grid-cols-3 gap-2'>
                  <input value={holdingForm.quantity} onChange={(e) => setHoldingForm((f) => ({ ...f, quantity: e.target.value }))} placeholder='수량' inputMode='decimal' className={theme === 'dark' ? 'rounded-xl border border-white/[0.06] bg-[#0f141c] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500' : 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400'} />
                  <input value={holdingForm.avgBuyPrice} onChange={(e) => setHoldingForm((f) => ({ ...f, avgBuyPrice: e.target.value }))} placeholder='평단가' inputMode='decimal' className={theme === 'dark' ? 'rounded-xl border border-white/[0.06] bg-[#0f141c] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500' : 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400'} />
                  <input value={holdingForm.currency} onChange={(e) => setHoldingForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} placeholder='통화' className={theme === 'dark' ? 'rounded-xl border border-white/[0.06] bg-[#0f141c] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500' : 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400'} />
                </div>
                <button type='submit' className={theme === 'dark' ? 'rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-white/90' : 'rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800'}>투자자산 추가</button>
              </form>
              <div className='mb-3 text-sm text-slate-600 dark:text-slate-400'>등록된 holdings <b className='text-slate-900 dark:text-slate-100'>{holdingsSafe.length}개</b></div>
              <div className='grid gap-2'>
                {holdingClassSummary.length ? holdingClassSummary.map((item) => (
                  <div key={item.key} className={theme === 'dark' ? 'flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm text-slate-200' : 'flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700'}>
                    <span>{item.label}</span>
                    <b className='tabular-nums text-slate-900 dark:text-slate-100'>{item.count}개</b>
                  </div>
                )) : <div className='text-sm text-slate-500 dark:text-slate-400'>아직 주식/코인 holdings가 없어요.</div>}
              </div>
              <div className='mt-4 space-y-2'>
                {holdingsSafe.slice(0, 5).map((h: any) => (
                  <div key={h.id} className={theme === 'dark' ? 'rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2' : 'rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2'}>
                    <div className='flex items-center justify-between gap-3'>
                      <div>
                        <div className='font-medium text-slate-900 dark:text-slate-100'>{h.displayName}</div>
                        <div className='text-xs text-slate-500 dark:text-slate-400'>{h.assetClass} · {h.symbol}</div>
                      </div>
                      <div className='text-right text-sm tabular-nums text-slate-900 dark:text-slate-100'>{h.quantity}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className={theme === 'dark' ? 'border-white/[0.05] bg-[#121821] shadow-[0_8px_24px_rgba(0,0,0,0.18)] xl:col-span-3' : 'border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)] xl:col-span-3'}>
            <CardContent className='p-5'>
              <h3 className='mb-3 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50'>자산/부채 현황</h3>
              <div className='grid gap-4 xl:grid-cols-2'>
                <div>
                  <div className='mb-2 text-sm text-slate-600 dark:text-slate-400'>자산 총액 <b className='text-slate-900 dark:text-slate-100'><MaskedValue value={won(bs.assetsTotal || 0)} masked={privacyMasked} /></b></div>
                  {(bs.assets || []).slice(0, 5).map((x: any, i: number) => <div key={i} className={theme === 'dark' ? 'mb-2 flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm text-slate-200' : 'mb-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700'}><span className='truncate pr-3'>{x.name}</span><b className='tabular-nums text-slate-900 dark:text-slate-100'>{x.weight}%</b></div>)}
                </div>
                <div>
                  <div className='mb-2 text-sm text-slate-600 dark:text-slate-400'>부채 총액 <b className='text-slate-900 dark:text-slate-100'><MaskedValue value={won(bs.liabilitiesTotal || 0)} masked={privacyMasked} /></b></div>
                  {(bs.liabilities || []).slice(0, 5).map((x: any, i: number) => <div key={i} className={theme === 'dark' ? 'mb-2 flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm text-slate-200' : 'mb-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700'}><span className='truncate pr-3'>{x.name}</span><b className='tabular-nums text-slate-900 dark:text-slate-100'>{x.weight}%</b></div>)}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </main>
  )
}
