'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'

export default function Page() {
  const householdId = 1
  const [rows, setRows] = useState<any[]>([])
  const [report, setReport] = useState<any>(null)
  const [balances, setBalances] = useState<any[]>([])

  async function refresh() {
    const res = await fetch(`${API}/households/${householdId}/net-worth`)
    const json = await res.json()
    setRows(Array.isArray(json) ? json : [])
  }

  async function bootstrap() {
    const res = await fetch(`${API}/local/bootstrap`, { method: 'POST' })
    const json = await res.json()
    alert(`로컬 초기화 완료: household=${json.household_id}`)
  }

  async function recompute() {
    await fetch(`${API}/snapshots/recompute?household_id=${householdId}`, { method: 'POST' })
    await refresh()
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

  async function uploadXlsx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${API}/imports/xlsx-local`, {
      method: 'POST',
      body: fd,
    })
    const json = await res.json()
    alert(`업로드 완료: imported=${json.imported}, skipped=${json.skipped_duplicates}`)
  }

  useEffect(() => {
    bootstrap().then(refresh).catch(console.error)
  }, [])

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Family Wealth Local MVP (인증 없음)</h1>
      <p>고정 Household: <b>1 (우리집)</b></p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={bootstrap}>로컬 초기화</button>
        <input type='file' accept='.xlsx' onChange={uploadXlsx} />
        <button onClick={recompute}>순자산 재계산</button>
        <button onClick={refresh}>순자산 새로고침</button>
        <button onClick={loadMonthlyReport}>월간 리포트</button>
        <button onClick={loadBalances}>결제수단 잔액</button>
      </div>

      <div style={{ width: '100%', height: 360, marginTop: 20 }}>
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

      <h3>Net Worth Data</h3>
      <pre>{JSON.stringify(rows, null, 2)}</pre>

      <h3>Monthly Report</h3>
      <pre>{JSON.stringify(report, null, 2)}</pre>

      <h3>Balances by Payment Method</h3>
      <pre>{JSON.stringify(balances, null, 2)}</pre>
    </main>
  )
}
