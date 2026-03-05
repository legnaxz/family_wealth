'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  BarChart, Bar, Legend, Sankey,
} from 'recharts'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'

const won = (n: number) => `₩${Math.round(Number(n || 0)).toLocaleString('ko-KR')}`
const flowLabel = (name: string) => {
  if (name.startsWith('수입·') || name.startsWith('지출·')) return name.split('·')[1]
  return name
}

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  boxShadow: '0 6px 18px rgba(15,23,42,0.08)',
  padding: 14,
}

const badge = (bg: string, color: string): React.CSSProperties => ({
  background: bg,
  color,
  borderRadius: 999,
  padding: '2px 10px',
  fontSize: 12,
  fontWeight: 700,
})

export default function Page() {
  const householdId = 1
  const [rows, setRows] = useState<any[]>([])
  const [expenseShare, setExpenseShare] = useState<any[]>([])
  const [incomeShare, setIncomeShare] = useState<any[]>([])
  const [monthly, setMonthly] = useState<any[]>([])
  const [flow, setFlow] = useState<any>({ nodes: [], links: [] })

  const latestNetWorth = useMemo(() => rows?.[rows.length - 1]?.netWorth ?? 0, [rows])
  const latestMonth = useMemo(() => monthly?.[monthly.length - 1] ?? null, [monthly])
  const prevMonth = useMemo(() => monthly?.[monthly.length - 2] ?? null, [monthly])
  const cashDelta = useMemo(() => {
    const cur = Number(latestMonth?.cashflow || 0)
    const prev = Number(prevMonth?.cashflow || 0)
    return cur - prev
  }, [latestMonth, prevMonth])

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
    await loadCategoryShare()
    await loadMonthlyCashflow()
    await loadFlow()
  }

  async function loadCategoryShare() {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1

    const eRes = await fetch(`${API}/households/${householdId}/category-share?year=${y}&month=${m}&tx_type=지출`)
    const eJson = await eRes.json()
    setExpenseShare(Array.isArray(eJson?.items) ? eJson.items : [])

    const iRes = await fetch(`${API}/households/${householdId}/category-share?year=${y}&month=${m}&tx_type=수입`)
    const iJson = await iRes.json()
    setIncomeShare(Array.isArray(iJson?.items) ? iJson.items : [])
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
    <main style={{ padding: 18, fontFamily: 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", Inter, sans-serif', background: '#f8fafc' }}>
      <div style={{ ...card, marginBottom: 12, background: 'linear-gradient(90deg,#eff6ff,#f0fdf4)' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>우리집 자산 현황판</h1>
        <p style={{ margin: '6px 0 12px', color: '#475569' }}>순자산 추이 · 월별 현금흐름 · 지출 구조 · 자산 흐름을 한눈에 확인해요.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={bootstrap}>로컬 초기화</button>
          <input type='file' accept='.xlsx' onChange={uploadXlsx} />
          <button onClick={recompute}>전체 재계산/새로고침</button>
        </div>
      </div>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
        <div style={card}><div style={{ color: '#64748b', fontSize: 12 }}>현재 순자산</div><b>{won(latestNetWorth)}</b></div>
        <div style={card}><div style={{ color: '#64748b', fontSize: 12 }}>당월 총수입</div><b>{won(latestMonth?.income || 0)}</b></div>
        <div style={card}><div style={{ color: '#64748b', fontSize: 12 }}>당월 총지출</div><b>{won(latestMonth?.expense || 0)}</b></div>
        <div style={card}><div style={{ color: '#64748b', fontSize: 12 }}>당월 순현금흐름</div><b>{won((latestMonth?.income || 0) - (latestMonth?.expense || 0))}</b></div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(380px, 1fr))', gap: 10 }}>
        <div style={card}>
          <h3 style={{ margin: '0 0 8px' }}>순자산 추이 (누적)</h3>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis dataKey='date' hide />
                <YAxis width={70} />
                <Tooltip formatter={(v: any) => won(Number(v))} />
                <Line type='monotone' dataKey='netWorth' stroke='#3b82f6' strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>월별 현금흐름 (최근 12개월)</h3>
            <span style={cashDelta >= 0 ? badge('#dcfce7', '#166534') : badge('#fee2e2', '#991b1b')}>
              전월 대비 {cashDelta >= 0 ? '+' : ''}{won(cashDelta)}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: 8, marginBottom: 8 }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 8 }}>
              <div style={{ fontSize: 12, color: '#166534' }}>당월 수입</div>
              <b>{won(latestMonth?.income || 0)}</b>
            </div>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 8 }}>
              <div style={{ fontSize: 12, color: '#991b1b' }}>당월 지출</div>
              <b>{won(latestMonth?.expense || 0)}</b>
            </div>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 8 }}>
              <div style={{ fontSize: 12, color: '#1d4ed8' }}>당월 순현금</div>
              <b>{won(latestMonth?.cashflow || 0)}</b>
            </div>
          </div>

          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={monthly.slice(-12)}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis dataKey='month' />
                <YAxis width={70} />
                <Tooltip formatter={(v: any) => won(Number(v))} />
                <Legend />
                <Bar dataKey='income' fill='#10b981' name='수입' radius={[6, 6, 0, 0]} />
                <Bar dataKey='expense' fill='#ef4444' name='지출' radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={card}>
          <h3 style={{ margin: '0 0 8px' }}>지출 카테고리 비중 (당월)</h3>
          <div style={{ maxHeight: 250, overflow: 'auto', fontSize: 13 }}>
            {expenseShare.slice(0, 12).map((c: any, i: number) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>{c.category}</span>
                  <b>{c.weight}% · {won(c.amount)}</b>
                </div>
                <div style={{ height: 8, background: '#e2e8f0', borderRadius: 999 }}>
                  <div style={{ width: `${Math.min(100, c.weight)}%`, height: 8, background: '#ef4444', borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={card}>
          <h3 style={{ margin: '0 0 8px' }}>수입 카테고리 비중 (당월)</h3>
          <div style={{ maxHeight: 250, overflow: 'auto', fontSize: 13 }}>
            {incomeShare.slice(0, 12).map((c: any, i: number) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>{c.category}</span>
                  <b>{c.weight}% · {won(c.amount)}</b>
                </div>
                <div style={{ height: 8, background: '#d1fae5', borderRadius: 999 }}>
                  <div style={{ width: `${Math.min(100, c.weight)}%`, height: 8, background: '#10b981', borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ ...card, marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>현금흐름 브리지 (수입 → 순현금흐름 → 지출/흑자)</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={badge('#dcfce7', '#166534')}>수입 흐름</span>
            <span style={badge('#fee2e2', '#991b1b')}>지출 흐름</span>
            <span style={badge('#e0e7ff', '#3730a3')}>최종 잔여</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, color: '#334155', fontSize: 13 }}>
          <span>총수입: <b>{won(flow?.summary?.income || 0)}</b></span>
          <span>총지출: <b>{won(flow?.summary?.expense || 0)}</b></span>
          <span>순현금흐름: <b>{won(flow?.summary?.net || 0)}</b></span>
        </div>
        <div style={{ width: '100%', height: 320 }}>
          {(flow?.nodes?.length || 0) > 1 && (flow?.links?.length || 0) > 0 ? (
            <ResponsiveContainer>
              <Sankey
                data={{
                  nodes: (flow.nodes || []).map((n: any) => ({ ...n, name: flowLabel(n.name) })),
                  links: flow.links || [],
                }}
                nodePadding={20}
                nodeWidth={14}
                iterations={64}
                link={{ stroke: '#94a3b8' }}
              >
                <Tooltip formatter={(v: any) => won(Number(v))} />
              </Sankey>
            </ResponsiveContainer>
          ) : (
            <div style={{ padding: 16, color: '#64748b' }}>흐름 데이터가 아직 없어요. 파일 업로드 후 "전체 재계산/새로고침"을 눌러주세요.</div>
          )}
        </div>
      </section>
    </main>
  )
}
