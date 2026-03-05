'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'

export default function Page() {
  const [email, setEmail] = useState('test@example.com')
  const [password, setPassword] = useState('test1234')
  const [token, setToken] = useState('')
  const [householdId, setHouseholdId] = useState(1)
  const [rows, setRows] = useState<any[]>([])

  async function authed(path: string, init: RequestInit = {}) {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> || {}),
      Authorization: `Bearer ${token}`,
    }
    return fetch(`${API}${path}`, { ...init, headers })
  }

  async function register() {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const json = await res.json()
    if (json.access_token) setToken(json.access_token)
    else alert(JSON.stringify(json))
  }

  async function login() {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const json = await res.json()
    if (json.access_token) setToken(json.access_token)
    else alert(JSON.stringify(json))
  }

  async function refresh() {
    if (!token) return
    const res = await authed(`/households/${householdId}/net-worth`)
    const json = await res.json()
    setRows(Array.isArray(json) ? json : [])
  }

  async function createHousehold() {
    if (!token) return alert('먼저 로그인')
    const res = await authed('/households', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '우리집' }),
    })
    const json = await res.json()
    if (json.id) {
      setHouseholdId(json.id)
      alert(`household created: ${json.id}`)
    } else {
      alert(JSON.stringify(json))
    }
  }

  useEffect(() => {
    refresh().catch(console.error)
  }, [householdId, token])

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Family Wealth MVP</h1>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder='email' />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder='password' type='password' />
        <button onClick={register}>회원가입</button>
        <button onClick={login}>로그인</button>
      </div>

      <p style={{ marginTop: 8, wordBreak: 'break-all' }}><b>Token:</b> {token ? `${token.slice(0, 24)}...` : '(없음)'}</p>

      <p>Household ID: <input type="number" value={householdId} onChange={(e) => setHouseholdId(Number(e.target.value))} /></p>
      <button onClick={createHousehold}>가족 생성</button>{' '}
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
