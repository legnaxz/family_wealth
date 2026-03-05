'use client'

import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'
const THEME = {
  income: '#ef4444',
  incomeSoft: '#fee2e2',
  expense: '#3b82f6',
  expenseSoft: '#dbeafe',
}
const won = (n: number) => `₩${Math.round(Number(n || 0)).toLocaleString('ko-KR')}`

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14,
  boxShadow: '0 6px 18px rgba(15,23,42,0.08)', padding: 14,
}

const CAT_ICON: Record<string, string> = {
  급여: '💼', 식비: '🍚', 교통: '🚌', 금융: '🏦', 온라인쇼핑: '🛒', 생활: '🏠', 여행: '✈️', 여행/숙박: '✈️',
  교육: '📚', 교육/학습: '📚', 의료: '🏥', 의료/건강: '🏥', 주거/통신: '🏡', 카페/간식: '☕', 패션/쇼핑: '👕', 미분류: '📌'
}

function heatColor(net: number, maxAbs: number) {
  if (maxAbs <= 0) return { bg: '#f8fafc', text: '#334155' }
  const t = Math.min(1, Math.abs(net) / maxAbs)
  if (net >= 0) {
    const a = 0.12 + t * 0.55
    return { bg: `rgba(239,68,68,${a})`, text: t > 0.55 ? '#fff' : '#7f1d1d' }
  }
  const a = 0.12 + t * 0.55
  return { bg: `rgba(59,130,246,${a})`, text: t > 0.55 ? '#fff' : '#1e3a8a' }
}

export default function Page() {
  const householdId = 1
  const [activeTab, setActiveTab] = useState<'calendar' | 'insights'>('calendar')
  const [rows, setRows] = useState<any[]>([])
  const [monthly, setMonthly] = useState<any[]>([])
  const [daily, setDaily] = useState<any[]>([])
  const [expenseShare, setExpenseShare] = useState<any[]>([])
  const [incomeShare, setIncomeShare] = useState<any[]>([])
  const [bs, setBs] = useState<any>({ assets: [], liabilities: [], assetsTotal: 0, liabilitiesTotal: 0 })
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [dayReport, setDayReport] = useState<any>(null)

  const latestNetWorth = useMemo(() => rows?.[rows.length - 1]?.netWorth ?? 0, [rows])
  const monthOptions = useMemo(() => (monthly || []).map((m: any) => m.month), [monthly])
  const dailyMap = useMemo(() => {
    const m: Record<string, any> = {}
    for (const d of daily || []) m[d.date] = d
    return m
  }, [daily])
  const maxAbsDailyNet = useMemo(() => {
    let max = 0
    for (const d of daily || []) max = Math.max(max, Math.abs(Number(d.net || 0)))
    return max
  }, [daily])

  const mergedCategories = useMemo(() => {
    const a = (incomeShare || []).map((x: any) => ({ ...x, type: '수입' }))
    const b = (expenseShare || []).map((x: any) => ({ ...x, type: '지출' }))
    return [...a, ...b].sort((x, y) => Number(y.amount) - Number(x.amount))
  }, [incomeShare, expenseShare])

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

  async function recompute() {
    await fetch(`${API}/snapshots/recompute?household_id=${householdId}`, { method: 'POST' })
    await Promise.all([refresh(), loadBalanceSheet(), loadMonthly()])
  }

  async function refresh() {
    const r = await fetch(`${API}/households/${householdId}/net-worth`)
    setRows(await r.json())
  }

  async function loadMonthly() {
    const r = await fetch(`${API}/households/${householdId}/cashflow/monthly`)
    setMonthly(await r.json())
  }

  async function loadDailyCashflow(monthKey: string) {
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return
    const y = Number(monthKey.slice(0, 4))
    const m = Number(monthKey.slice(5, 7))
    const r = await fetch(`${API}/households/${householdId}/cashflow/daily?year=${y}&month=${m}`)
    setDaily(await r.json())
  }

  async function loadDailyReport(day: string) {
    const r = await fetch(`${API}/households/${householdId}/cashflow/daily-report?day=${encodeURIComponent(day)}`)
    setDayReport(await r.json())
  }

  async function loadBalanceSheet() {
    const r = await fetch(`${API}/households/${householdId}/balance-sheet`)
    setBs(await r.json())
  }

  async function loadCategoryShare(monthKey?: string) {
    let y: number, m: number
    if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) {
      y = Number(monthKey.slice(0, 4)); m = Number(monthKey.slice(5, 7))
    } else {
      const now = new Date(); y = now.getFullYear(); m = now.getMonth() + 1
    }

    const e = await fetch(`${API}/households/${householdId}/category-share?year=${y}&month=${m}&tx_type=지출`)
    const i = await fetch(`${API}/households/${householdId}/category-share?year=${y}&month=${m}&tx_type=수입`)
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

  useEffect(() => {
    if (!monthOptions.length) return
    const current = selectedMonth || monthOptions[monthOptions.length - 1]
    if (!selectedMonth) setSelectedMonth(current)
    Promise.all([loadCategoryShare(current), loadDailyCashflow(current)]).catch(console.error)
  }, [monthOptions, selectedMonth])

  useEffect(() => {
    if (!selectedDate && calendarDays.length) {
      const first = calendarDays.find((d: any) => d.iso)?.iso
      if (first) setSelectedDate(first)
    }
  }, [calendarDays, selectedDate])

  useEffect(() => {
    if (selectedDate) loadDailyReport(selectedDate).catch(console.error)
  }, [selectedDate])

  return (
    <main style={{ padding: 16, background: '#f8fafc', fontFamily: 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", Inter, sans-serif' }}>
      <div style={{ ...card, marginBottom: 10, background: 'linear-gradient(90deg,#eff6ff,#f0fdf4)' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>대시보드</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button onClick={() => setActiveTab('calendar')}>현금흐름 달력</button>
          <button onClick={() => setActiveTab('insights')}>재무 인사이트</button>
          <button onClick={bootstrap}>로컬 초기화</button>
          <input type='file' accept='.xlsx' onChange={uploadXlsx} />
          <button onClick={recompute}>전체 재계산</button>
        </div>
      </div>

      {activeTab === 'calendar' ? (
        <section style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>현금흐름 달력</h3>
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '4px 8px' }}>
                {monthOptions.map((m: string) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
                <div key={d} style={{ fontSize: 11, color: '#64748b', textAlign: 'center' }}>{d}</div>
              ))}
              {calendarDays.map((d: any) => {
                if (d.empty) return <div key={d.key} />
                const hc = heatColor(Number(d.net || 0), maxAbsDailyNet)
                return (
                  <button
                    key={d.iso}
                    onClick={() => setSelectedDate(d.iso)}
                    style={{
                      border: selectedDate === d.iso ? '2px solid #0f172a' : '1px solid #e5e7eb',
                      borderRadius: 10, padding: 6, minHeight: 68, background: hc.bg, textAlign: 'left', cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontSize: 11, color: hc.text, marginBottom: 4, fontWeight: 700 }}>{d.day}</div>
                    {d.income > 0 && <div style={{ fontSize: 10, color: hc.text, backdropFilter: 'blur(2px)' }}>+{won(d.income)}</div>}
                    {d.expense > 0 && <div style={{ fontSize: 10, color: hc.text, backdropFilter: 'blur(2px)' }}>-{won(d.expense)}</div>}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 8px' }}>일일 리포트</h3>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{dayReport?.date || selectedDate || '-'}</div>
            <div style={{ fontSize: 13, marginBottom: 4, color: THEME.income }}>수입 {won(dayReport?.income || 0)}</div>
            <div style={{ fontSize: 13, marginBottom: 4, color: THEME.expense }}>지출 {won(dayReport?.expense || 0)}</div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>순흐름 {won(dayReport?.net || 0)}</div>

            <div style={{ maxHeight: 320, overflow: 'auto' }}>
              {(dayReport?.categories || []).slice(0, 12).map((c: any, i: number) => {
                const isIncome = c.type === '수입'
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span>{CAT_ICON[c.category] || '📌'} {c.category}</span>
                    <b style={{ color: isIncome ? THEME.income : THEME.expense }}>{isIncome ? '+' : '-'}{won(c.amount)}</b>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ ...card, gridColumn: '1 / span 2' }}>
            <h3 style={{ margin: '0 0 8px' }}>월 카테고리 통합 (수입+지출)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(280px, 1fr))', gap: 8 }}>
              {mergedCategories.slice(0, 16).map((c: any, i: number) => {
                const isIncome = c.type === '수입'
                const color = isIncome ? THEME.income : THEME.expense
                const bg = isIncome ? THEME.incomeSoft : THEME.expenseSoft
                return (
                  <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span>{CAT_ICON[c.category] || '📌'} {c.category}</span>
                      <b style={{ color }}>{isIncome ? '+' : '-'}{won(c.amount)}</b>
                    </div>
                    <div style={{ height: 7, background: bg, borderRadius: 999, marginTop: 6 }}>
                      <div style={{ width: `${Math.min(100, c.weight)}%`, height: 7, background: color, borderRadius: 999 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      ) : (
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={card}>
            <h3 style={{ margin: '0 0 8px' }}>순자산</h3>
            <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 8 }}>{won(latestNetWorth)}</div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={rows}>
                  <CartesianGrid strokeDasharray='3 3' />
                  <XAxis dataKey='date' tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis width={92} tickFormatter={(v) => won(Number(v))} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => won(Number(v))} />
                  <Line type='monotone' dataKey='netWorth' stroke='#16a34a' strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 8px' }}>자산/부채 현황</h3>
            <div style={{ marginBottom: 8, color: '#7f1d1d' }}>자산 총액 <b>{won(bs.assetsTotal || 0)}</b></div>
            {(bs.assets || []).slice(0, 6).map((x: any, i: number) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{x.name}</span><b>{x.weight}%</b></div>
                <div style={{ height: 7, background: THEME.incomeSoft, borderRadius: 999 }}><div style={{ width: `${x.weight}%`, height: 7, background: THEME.income, borderRadius: 999 }} /></div>
              </div>
            ))}
            <div style={{ margin: '8px 0', color: '#1e3a8a' }}>부채 총액 <b>{won(bs.liabilitiesTotal || 0)}</b></div>
            {(bs.liabilities || []).slice(0, 6).map((x: any, i: number) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{x.name}</span><b>{x.weight}%</b></div>
                <div style={{ height: 7, background: THEME.expenseSoft, borderRadius: 999 }}><div style={{ width: `${x.weight}%`, height: 7, background: THEME.expense, borderRadius: 999 }} /></div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
