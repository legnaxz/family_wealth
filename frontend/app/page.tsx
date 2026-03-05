'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'

export default function Page() {
  const [householdId, setHouseholdId] = useState(1)
  const [rows, setRows] = useState<any[]>([])

  async function refresh() {
    const res = await fetch(`${API}/households/${householdId}/net-worth`)
    setRows(await res.json())
  }

  async function seed() {
    await fetch(`${API}/households`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '우리집' }),
    })
    alert('household created (기본 user_id=1 가정)')
  }

  useEffect(() => {
    refresh().catch(console.error)
  }, [householdId])

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Family Wealth MVP</h1>
      <p>Household ID: <input type="number" value={householdId} onChange={(e) => setHouseholdId(Number(e.target.value))} /></p>
      <button onClick={seed}>가족 생성</button>{' '}
      <button onClick={refresh}>새로고침</button>

      <div style={{ width: '100%', height: 360, marginTop: 20 }}>
        <ResponsiveContainer>
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="netWorth" stroke="#3b82f6" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <pre>{JSON.stringify(rows, null, 2)}</pre>
    </main>
  )
}
