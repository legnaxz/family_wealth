'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'

export default function Page() {
  const [email, setEmail] = useState('test@example.com')
  const [password, setPassword] = useState('test1234')
  const [otpCode, setOtpCode] = useState('')
  const [token, setToken] = useState('demo')
  const [inviteToken, setInviteToken] = useState('')
  const [householdId, setHouseholdId] = useState(1)
  const [rows, setRows] = useState<any[]>([])
  const [report, setReport] = useState<any>(null)
  const [balances, setBalances] = useState<any[]>([])

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
      body: JSON.stringify({ email, password, otp_code: otpCode || undefined }),
    })
    const json = await res.json()
    if (json.access_token) setToken(json.access_token)
    else alert(JSON.stringify(json))
  }

  async function setup2FA() {
    if (!token) return alert('먼저 로그인')
    const res = await authed('/auth/2fa/setup', { method: 'POST' })
    const json = await res.json()
    alert(`2FA secret: ${json.secret}\n\nURI:\n${json.otpauth_uri}`)
  }

  async function enable2FA() {
    if (!token) return alert('먼저 로그인')
    if (!otpCode) return alert('OTP 코드 입력 필요')
    const res = await authed(`/auth/2fa/enable?code=${encodeURIComponent(otpCode)}`, { method: 'POST' })
    const json = await res.json()
    alert(JSON.stringify(json))
  }

  async function refresh() {
    if (!token) return
    const res = await authed(`/households/${householdId}/net-worth`)
    const json = await res.json()
    setRows(Array.isArray(json) ? json : [])
  }

  async function loadMonthlyReport() {
    if (!token) return
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const res = await authed(`/households/${householdId}/reports/monthly?year=${y}&month=${m}`)
    setReport(await res.json())
  }

  async function loadBalances() {
    if (!token) return
    const res = await authed(`/households/${householdId}/balances/by-payment-method`)
    const json = await res.json()
    setBalances(Array.isArray(json) ? json : [])
  }

  async function createInviteToken() {
    if (!token) return alert('먼저 로그인')
    const res = await authed(`/households/${householdId}/invite-tokens?role=member&expires_hours=72`, { method: 'POST' })
    const json = await res.json()
    if (json.token) {
      setInviteToken(json.token)
      alert(`invite token 발급 완료: ${json.token}`)
    } else {
      alert(JSON.stringify(json))
    }
  }

  async function joinWithInviteToken() {
    if (!token) return alert('먼저 로그인')
    if (!inviteToken) return alert('초대 토큰 입력 필요')
    const res = await authed(`/households/join?token=${encodeURIComponent(inviteToken)}`, { method: 'POST' })
    const json = await res.json()
    alert(JSON.stringify(json))
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
        <input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder='otp(2FA) optional' />
        <button onClick={register}>회원가입</button>
        <button onClick={login}>로그인</button>
        <button onClick={setup2FA}>2FA 설정</button>
        <button onClick={enable2FA}>2FA 활성화</button>
      </div>

      <p style={{ marginTop: 8, wordBreak: 'break-all' }}><b>Token:</b> {token ? `${token.slice(0, 24)}...` : '(없음)'}</p>

      <p>Household ID: <input type="number" value={householdId} onChange={(e) => setHouseholdId(Number(e.target.value))} /></p>
      <button onClick={createHousehold}>가족 생성</button>{' '}
      <button onClick={refresh}>순자산 새로고침</button>{' '}
      <button onClick={loadMonthlyReport}>월간 리포트</button>{' '}
      <button onClick={loadBalances}>결제수단 잔액</button>{' '}
      <button onClick={createInviteToken}>초대토큰 생성</button>{' '}
      <button onClick={joinWithInviteToken}>초대토큰으로 참여</button>

      <p>Invite Token: <input value={inviteToken} onChange={(e) => setInviteToken(e.target.value)} style={{ width: 420 }} /></p>

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

      <h3>Net Worth Data</h3>
      <pre>{JSON.stringify(rows, null, 2)}</pre>

      <h3>Monthly Report</h3>
      <pre>{JSON.stringify(report, null, 2)}</pre>

      <h3>Balances by Payment Method</h3>
      <pre>{JSON.stringify(balances, null, 2)}</pre>
    </main>
  )
}
