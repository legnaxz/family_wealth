'use client'

import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, Sankey,
} from 'recharts'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316']

export default function Page() {
  const householdId = 1
  const [rows, setRows] = useState<any[]>([])
  const [report, setReport] = useState<any>(null)
  const [balances, setBalances] = useState<any[]>([])
  const [monthly, setMonthly] = useState<any[]>([])
  const [flow, setFlow] = useState<any>({ nodes: [], links: [] })

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
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>가계부 대시보드 (로컬)</h1>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={bootstrap}>로컬 초기화</button>
        <input type='file' accept='.xlsx' onChange={uploadXlsx} />
        <button onClick={recompute}>전체 재계산/새로고침</button>
      </div>

      <h3>순자산 추이</h3>
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer>
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis dataKey='date' />
            <YAxis />
            <Tooltip />
            <Line type='monotone' dataKey='netWorth' stroke='#3b82f6' strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <h3>월별 현금흐름 (수입/지출)</h3>
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer>
          <BarChart data={monthly.slice(-12)}>
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis dataKey='month' />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey='income' fill='#10b981' />
            <Bar dataKey='expense' fill='#ef4444' />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h3>이번 달 지출 카테고리</h3>
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={report?.expenseByCategory || []} dataKey='amount' nameKey='category' outerRadius={110} label>
              {(report?.expenseByCategory || []).map((_: any, i: number) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <h3>자산 플로우 차트 (수입/지출/이체 → 카테고리 → 순자산)</h3>
      <div style={{ width: '100%', height: 420 }}>
        <ResponsiveContainer>
          <Sankey data={flow} nodePadding={24} nodeWidth={14} link={{ stroke: '#94a3b8' }} />
        </ResponsiveContainer>
      </div>

      <h3>결제수단 잔액 집계</h3>
      <pre>{JSON.stringify(balances, null, 2)}</pre>
    </main>
  )
}
