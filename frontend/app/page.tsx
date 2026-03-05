'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  Sankey,
} from 'recharts'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'
const THEME = {
  income: '#ef4444',      // 수입: 빨간계열
  incomeSoft: '#fee2e2',
  expense: '#3b82f6',     // 지출: 파란계열
  expenseSoft: '#dbeafe',
}
const won = (n: number) => `₩${Math.round(Number(n || 0)).toLocaleString('ko-KR')}`
const flowLabel = (name: string) => {
  if (name.startsWith('수입·') || name.startsWith('지출·')) return name.split('·')[1]
  return name
}

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14,
  boxShadow: '0 6px 18px rgba(15,23,42,0.08)', padding: 14,
}

export default function Page() {
  const householdId = 1
  const [rows, setRows] = useState<any[]>([])
  const [monthly, setMonthly] = useState<any[]>([])
  const [flow, setFlow] = useState<any>({ nodes: [], links: [], summary: {} })
  const [expenseShare, setExpenseShare] = useState<any[]>([])
  const [incomeShare, setIncomeShare] = useState<any[]>([])
  const [bs, setBs] = useState<any>({ assets: [], liabilities: [], assetsTotal: 0, liabilitiesTotal: 0 })

  const latestNetWorth = useMemo(() => rows?.[rows.length - 1]?.netWorth ?? 0, [rows])

  async function bootstrap() { await fetch(`${API}/local/bootstrap`, { method: 'POST' }) }

  async function recompute() {
    await fetch(`${API}/snapshots/recompute?household_id=${householdId}`, { method: 'POST' })
    await Promise.all([refresh(), loadMonthly(), loadFlow(), loadCategoryShare(), loadBalanceSheet()])
  }

  async function refresh() {
    const r = await fetch(`${API}/households/${householdId}/net-worth`)
    setRows(await r.json())
  }

  async function loadMonthly() {
    const r = await fetch(`${API}/households/${householdId}/cashflow/monthly`)
    setMonthly(await r.json())
  }

  async function loadFlow() {
    const r = await fetch(`${API}/households/${householdId}/flow`)
    setFlow(await r.json())
  }

  async function loadBalanceSheet() {
    const r = await fetch(`${API}/households/${householdId}/balance-sheet`)
    setBs(await r.json())
  }

  async function loadCategoryShare() {
    const now = new Date(); const y = now.getFullYear(); const m = now.getMonth() + 1
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

  return (
    <main style={{ padding: 16, background: '#f8fafc', fontFamily: 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", Inter, sans-serif' }}>
      <div style={{ ...card, marginBottom: 10, background: 'linear-gradient(90deg,#eff6ff,#f0fdf4)' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>대시보드</h1>
        <p style={{ margin: '6px 0 10px', color: '#475569' }}>첨부해준 레퍼런스 구조로 재배치한 오버뷰 화면</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={bootstrap}>로컬 초기화</button>
          <input type='file' accept='.xlsx' onChange={uploadXlsx} />
          <button onClick={recompute}>전체 재계산</button>
        </div>
      </div>

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
          <h3 style={{ margin: '0 0 8px' }}>현금흐름</h3>
          <div style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: THEME.income }}>수입 <b>{won(flow?.summary?.income || 0)}</b></span>
            <span style={{ color: THEME.expense }}>지출 <b>{won(flow?.summary?.expense || 0)}</b></span>
            <span>순흐름 <b>{won(flow?.summary?.net || 0)}</b></span>
          </div>
          <div style={{ width: '100%', height: 220 }}>
            {(flow?.nodes?.length || 0) > 1 ? (
              <ResponsiveContainer>
                <Sankey
                  data={{ nodes: (flow.nodes || []).map((n: any) => ({ ...n, name: flowLabel(n.name) })), links: flow.links || [] }}
                  nodePadding={18}
                  nodeWidth={12}
                  iterations={64}
                  link={{ stroke: '#9ca3af' }}
                >
                  <Tooltip formatter={(v: any) => won(Number(v))} />
                </Sankey>
              </ResponsiveContainer>
            ) : <div style={{ color: '#64748b' }}>데이터가 없습니다.</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 6 }}>
            <span style={{ border: `1px solid ${THEME.income}`, color: THEME.income, borderRadius: 999, padding: '2px 8px', fontSize: 11 }}>수입 흐름</span>
            <span style={{ border: `1px solid ${THEME.expense}`, color: THEME.expense, borderRadius: 999, padding: '2px 8px', fontSize: 11 }}>지출 흐름</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 12, color: THEME.income, marginBottom: 6 }}>수입 태그</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(flow?.incomeBreakdown || []).slice(0, 8).map((x: any, i: number) => (
                  <span key={i} style={{ border: `1px solid ${THEME.income}`, background: THEME.incomeSoft, color: '#7f1d1d', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>
                    {x.category} {won(x.amount)}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: THEME.expense, marginBottom: 6 }}>지출 태그</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(flow?.expenseBreakdown || []).slice(0, 8).map((x: any, i: number) => (
                  <span key={i} style={{ border: `1px solid ${THEME.expense}`, background: THEME.expenseSoft, color: '#1e3a8a', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>
                    {x.category} {won(x.amount)}
                  </span>
                ))}
              </div>
            </div>
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
          {(Number(bs.assetsTotal || 0) === 0 && Number(bs.liabilitiesTotal || 0) === 0) && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>시트1(재무현황) 데이터가 아직 반영되지 않았어. 파일 업로드 후 전체 재계산을 눌러줘.</div>
          )}
        </div>

        <div style={card}>
          <h3 style={{ margin: '0 0 8px' }}>지출/수입 카테고리 비중 (당월)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: THEME.expense, marginBottom: 6 }}>지출</div>
              {expenseShare.slice(0, 8).map((c: any, i: number) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>{c.category}</span><b>{c.weight}%</b></div>
                  <div style={{ height: 7, background: THEME.expenseSoft, borderRadius: 999 }}><div style={{ width: `${c.weight}%`, height: 7, background: THEME.expense, borderRadius: 999 }} /></div>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 12, color: THEME.income, marginBottom: 6 }}>수입</div>
              {incomeShare.slice(0, 8).map((c: any, i: number) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>{c.category}</span><b>{c.weight}%</b></div>
                  <div style={{ height: 7, background: THEME.incomeSoft, borderRadius: 999 }}><div style={{ width: `${c.weight}%`, height: 7, background: THEME.income, borderRadius: 999 }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
