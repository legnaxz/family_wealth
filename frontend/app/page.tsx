'use client'

import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { OwnerTabs } from '../components/OwnerTabs'
import { API, CAT_ICON, OwnerScope, THEME, card, heatColor, won } from '../lib/ui'

export default function Page() {
  const householdId = 1
  const [activeTab, setActiveTab] = useState<'calendar' | 'insights'>('calendar')
  const [ownerScope, setOwnerScope] = useState<OwnerScope>('all')
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
  const latestMonth = useMemo(() => monthly?.[monthly.length - 1] || null, [monthly])
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
    await Promise.all([refresh(), loadBalanceSheet(), loadMonthly()])
  }

  async function refresh() {
    const r = await fetch(`${API}/households/${householdId}/net-worth?${qs()}`)
    setRows(await r.json())
  }

  async function loadMonthly() {
    const r = await fetch(`${API}/households/${householdId}/cashflow/monthly?${qs()}`)
    setMonthly(await r.json())
  }

  async function loadDailyCashflow(monthKey: string) {
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return
    const y = Number(monthKey.slice(0, 4))
    const m = Number(monthKey.slice(5, 7))
    const r = await fetch(`${API}/households/${householdId}/cashflow/daily?year=${y}&month=${m}&${qs()}`)
    setDaily(await r.json())
  }

  async function loadDailyReport(day: string) {
    const r = await fetch(`${API}/households/${householdId}/cashflow/daily-report?day=${encodeURIComponent(day)}&${qs()}`)
    setDayReport(await r.json())
  }

  async function loadBalanceSheet() {
    const r = await fetch(`${API}/households/${householdId}/balance-sheet?${qs()}`)
    setBs(await r.json())
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
  useEffect(() => { Promise.all([refresh(), loadBalanceSheet(), loadMonthly()]).catch(console.error) }, [ownerScope])

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

  return (
    <main style={{ padding: 16, background: THEME.pageBg, fontFamily: 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", Inter, sans-serif' }}>
      <div style={{ ...card, marginBottom: 10, background: 'linear-gradient(90deg,#eff6ff,#f0fdf4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>Family Wealth</h1>
            <div style={{ color: THEME.textSoft, fontSize: 13, marginTop: 4 }}>모바일은 요약 중심, 웹은 전체 기록 중심으로 정리 중</div>
          </div>
          <OwnerTabs value={ownerScope} onChange={setOwnerScope} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button onClick={() => setActiveTab('calendar')}>현금흐름</button>
          <button onClick={() => setActiveTab('insights')}>재무 인사이트</button>
          <button onClick={bootstrap}>로컬 초기화</button>
          <input type='file' accept='.xlsx' onChange={uploadXlsx} />
          <button onClick={recompute}>전체 재계산</button>
        </div>
      </div>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
        <div style={card}><div style={{ color: THEME.textSoft, fontSize: 12 }}>이번 달 순현금흐름</div><div style={{ fontSize: 24, fontWeight: 800 }}>{won(latestMonth?.cashflow || 0)}</div></div>
        <div style={card}><div style={{ color: THEME.textSoft, fontSize: 12 }}>이번 달 지출</div><div style={{ fontSize: 24, fontWeight: 800, color: THEME.expense }}>{won(latestMonth?.expense || 0)}</div></div>
        <div style={card}><div style={{ color: THEME.textSoft, fontSize: 12 }}>이번 달 수입</div><div style={{ fontSize: 24, fontWeight: 800, color: THEME.income }}>{won(latestMonth?.income || 0)}</div></div>
        <div style={card}><div style={{ color: THEME.textSoft, fontSize: 12 }}>순자산</div><div style={{ fontSize: 24, fontWeight: 800 }}>{won(latestNetWorth)}</div></div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10, marginBottom: 10 }}>
        <div style={card}>
          <h3 style={{ margin: '0 0 8px' }}>최근 기록</h3>
          <div style={{ maxHeight: 240, overflow: 'auto' }}>
            {recentTransactions.length ? recentTransactions.map((t: any, i: number) => {
              const isIncome = t.type === '수입'
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', padding: '8px 0', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{t.content || t.category}</div>
                    <div style={{ fontSize: 12, color: THEME.textSoft }}>{CAT_ICON[t.category] || '📌'} {t.category} · {t.ownerScope}</div>
                  </div>
                  <div style={{ fontWeight: 800, color: isIncome ? THEME.income : THEME.expense }}>{isIncome ? '+' : '-'}{won(Math.abs(t.amount || 0))}</div>
                </div>
              )
            }) : <div style={{ color: THEME.textSoft, fontSize: 13 }}>선택한 날짜의 거래가 아직 없어요.</div>}
          </div>
        </div>

        <div style={card}>
          <h3 style={{ margin: '0 0 8px' }}>오늘/선택일 요약</h3>
          <div style={{ fontSize: 12, color: THEME.textSoft, marginBottom: 8 }}>{dayReport?.date || selectedDate || '-'}</div>
          <div style={{ fontSize: 13, marginBottom: 4, color: THEME.income }}>수입 {won(dayReport?.income || 0)}</div>
          <div style={{ fontSize: 13, marginBottom: 4, color: THEME.expense }}>지출 {won(dayReport?.expense || 0)}</div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>순흐름 {won(dayReport?.net || 0)}</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {(dayReport?.categories || []).slice(0, 5).map((c: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span>{CAT_ICON[c.category] || '📌'} {c.category}</span>
                <b>{won(c.amount)}</b>
              </div>
            ))}
          </div>
        </div>
      </section>

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
              {['일', '월', '화', '수', '목', '금', '토'].map((d) => <div key={d} style={{ fontSize: 11, color: THEME.textSoft, textAlign: 'center' }}>{d}</div>)}
              {calendarDays.map((d: any) => {
                if (d.empty) return <div key={d.key} />
                const hc = heatColor(Number(d.net || 0), maxAbsDailyNet)
                return (
                  <button key={d.iso} onClick={() => setSelectedDate(d.iso)} style={{ border: selectedDate === d.iso ? '2px solid #0f172a' : '1px solid #e5e7eb', borderRadius: 10, padding: 6, minHeight: 68, background: hc.bg, textAlign: 'left', cursor: 'pointer' }}>
                    <div style={{ fontSize: 11, color: hc.text, marginBottom: 4, fontWeight: 700 }}>{d.day}</div>
                    {d.net !== 0 && <div style={{ fontSize: 10, color: hc.text }}>{won(d.net)}</div>}
                    {d.income > 0 && <div style={{ fontSize: 10, color: hc.text }}>+{won(d.income)}</div>}
                    {d.expense > 0 && <div style={{ fontSize: 10, color: hc.text }}>-{won(d.expense)}</div>}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 8px' }}>월 카테고리</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {mergedCategories.slice(0, 10).map((c: any, i: number) => {
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
            <h3 style={{ margin: '0 0 8px' }}>순자산 추이</h3>
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
            <div style={{ marginBottom: 8 }}>자산 총액 <b>{won(bs.assetsTotal || 0)}</b></div>
            {(bs.assets || []).slice(0, 5).map((x: any, i: number) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span>{x.name}</span><b>{x.weight}%</b></div>)}
            <div style={{ margin: '12px 0 8px' }}>부채 총액 <b>{won(bs.liabilitiesTotal || 0)}</b></div>
            {(bs.liabilities || []).slice(0, 5).map((x: any, i: number) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span>{x.name}</span><b>{x.weight}%</b></div>)}
          </div>
        </section>
      )}
    </main>
  )
}
