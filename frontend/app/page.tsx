'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, Sankey,
} from 'recharts'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316']

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  boxShadow: '0 4px 14px rgba(15,23,42,0.06)',
  padding: 14,
}

export default function Page() {
  const householdId = 1
  const [rows, setRows] = useState<any[]>([])
  const [report, setReport] = useState<any>(null)
  const [balances, setBalances] = useState<any[]>([])
  const [monthly, setMonthly] = useState<any[]>([])
  const [flow, setFlow] = useState<any>({ nodes: [], links: [] })

  const latestNetWorth = useMemo(() => rows?.[rows.length - 1]?.netWorth ?? 0, [rows])
  const latestMonth = useMemo(() => monthly?.[monthly.length - 1] ?? null, [monthly])

  async function refresh() {
    const res = await fetch(`${API}/households/${householdId}/net-worth`)
    const json = await res.json()
    setRows(Array.isArray(json) ? json : [])
  }

  async function bootstrap() {
    await fetch(`${API}/local/bootstrap`, { method: 'POST' })
  }

  async function recompute() {
    await fetch(`${API}/snapshots/recompute?household_id=${householdId}`, { method: 'POST' })
    await refresh()
    await loadMonthlyReport()
    await loadBalances()
    await loadMonthlyCashflow()
    await loadFlow()
  }

  async function loadMonthlyReport() {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const res = await fetch(`${API}/households/${householdId}/reports/monthly?year=${y}&month=${m}`)
    setReport(await res.json())
  }

  async function loadBalances() {
    const res = await fetch(`${API}/households/${householdId}/balances/by-payment-method`)
    const json = await res.json()
    setBalances(Array.isArray(json) ? json : [])
  }

  async function loadMonthlyCashflow() {
    const res = await fetch(`${API}/households/${householdId}/cashflow/monthly`)
    const json = await res.json()
    setMonthly(Array.isArray(json) ? json : [])
  }

  async function loadFlow() {
    const res = await fetch(`${API}/households/${householdId}/flow`)
    setFlow(await res.json())
  }

  async function uploadXlsx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${API}/imports/xlsx-local`, { method: 'POST', body: fd })
    const json = await res.json()
    alert(`업로드 완료: tx=${json.imported}, skip=${json.skipped_duplicates}, assets=${json.imported_assets}, liabilities=${json.imported_liabilities}`)
  }

  useEffect(() => {
    bootstrap().then(recompute).catch(console.error)
  }, [])

  return (
    <main style={{ padding: 18, fontFamily: 'Inter, Pretendard, sans-serif', background: '#f8fafc' }}>
      <div style={{ ...card, marginBottom: 12, background: 'linear-gradient(90deg,#eff6ff,#f0fdf4)' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>가계부 오버뷰 대시보드</h1>
        <p style={{ margin: '6px 0 12px', color: '#475569' }}>한 화면에서 자산 흐름/지출 구조/현금흐름을 한 번에 보는 로컬 리포트</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={bootstrap}>로컬 초기화</button>
          <input type='file' accept='.xlsx' onChange={uploadXlsx} />
          <button onClick={recompute}>전체 재계산/새로고침</button>
        </div>
      </div>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
        <div style={card}><div style={{ color: '#64748b', fontSize: 12 }}>현재 순자산</div><b>{Number(latestNetWorth).toLocaleString()} KRW</b></div>
        <div style={card}><div style={{ color: '#64748b', fontSize: 12 }}>이번달 수입</div><b>{Number(latestMonth?.income || 0).toLocaleString()} KRW</b></div>
        <div style={card}><div style={{ color: '#64748b', fontSize: 12 }}>이번달 지출</div><b>{Number(latestMonth?.expense || 0).toLocaleString()} KRW</b></div>
        <div style={card}><div style={{ color: '#64748b', fontSize: 12 }}>이번달 현금흐름</div><b>{Number((latestMonth?.income || 0) - (latestMonth?.expense || 0)).toLocaleString()} KRW</b></div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(380px, 1fr))', gap: 10 }}>
        <div style={card}>
          <h3 style={{ margin: '0 0 8px' }}>순자산 추이</h3>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis dataKey='date' hide />
                <YAxis width={70} />
                <Tooltip />
                <Line type='monotone' dataKey='netWorth' stroke='#3b82f6' strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={card}>
          <h3 style={{ margin: '0 0 8px' }}>월별 현금흐름</h3>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              <BarChart data={monthly.slice(-12)}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis dataKey='month' />
                <YAxis width={70} />
                <Tooltip />
                <Legend />
                <Bar dataKey='income' fill='#10b981' name='수입' />
                <Bar dataKey='expense' fill='#ef4444' name='지출' />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={card}>
          <h3 style={{ margin: '0 0 8px' }}>이번 달 지출 카테고리</h3>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={report?.expenseByCategory || []} dataKey='amount' nameKey='category' outerRadius={86} label>
                  {(report?.expenseByCategory || []).map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={card}>
          <h3 style={{ margin: '0 0 8px' }}>결제수단 잔액 Top</h3>
          <div style={{ maxHeight: 250, overflow: 'auto', fontSize: 14 }}>
            {(balances || []).slice(0, 12).map((b, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', padding: '7px 0' }}>
                <span style={{ color: '#334155' }}>{b.paymentMethod}</span>
                <b>{Number(b.balance).toLocaleString()}</b>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ ...card, marginTop: 10 }}>
        <h3 style={{ margin: '0 0 8px' }}>자산 플로우 차트</h3>
        <div style={{ width: '100%', height: 300 }}>
          {(flow?.nodes?.length || 0) > 1 && (flow?.links?.length || 0) > 0 ? (
            <ResponsiveContainer>
              <Sankey data={flow} nodePadding={18} nodeWidth={12} link={{ stroke: '#94a3b8' }} />
            </ResponsiveContainer>
          ) : (
            <div style={{ padding: 16, color: '#64748b' }}>플로우 데이터가 아직 없어. 업로드 후 "전체 재계산/새로고침"을 눌러줘.</div>
          )}
        </div>
      </section>
    </main>
  )
}
