export const API = (() => {
  const envBase = process.env.NEXT_PUBLIC_API_BASE
  if (envBase) return envBase
  if (typeof window !== 'undefined') {
    const { hostname } = window.location
    const proto = hostname.endsWith('.ts.net') ? 'https:' : window.location.protocol
    return `${proto}//${hostname}:8000`
  }
  return 'http://localhost:8000'
})()

export const owners = [
  { value: 'all', label: '전체' },
  { value: 'self', label: '본인' },
  { value: 'spouse', label: '배우자' },
] as const

export type OwnerScope = (typeof owners)[number]['value']

export const THEME = {
  income: '#ef4444',
  incomeSoft: '#fee2e2',
  expense: '#3b82f6',
  expenseSoft: '#dbeafe',
  border: '#e5e7eb',
  textSoft: '#64748b',
  pageBg: '#f8fafc',
}

export const won = (n: number) => `₩${Math.round(Number(n || 0)).toLocaleString('ko-KR')}`

export const card: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${THEME.border}`,
  borderRadius: 14,
  boxShadow: '0 6px 18px rgba(15,23,42,0.08)',
  padding: 14,
}

export const CAT_ICON: Record<string, string> = {
  '급여': '💼', '식비': '🍚', '교통': '🚌', '금융': '🏦', '온라인쇼핑': '🛒', '생활': '🏠', '여행': '✈️', '여행/숙박': '✈️',
  '교육': '📚', '교육/학습': '📚', '의료': '🏥', '의료/건강': '🏥', '주거/통신': '🏡', '카페/간식': '☕', '패션/쇼핑': '👕', '미분류': '📌'
}

export function heatColor(net: number, maxAbs: number, theme: 'light' | 'dark' = 'light') {
  if (maxAbs <= 0) {
    return theme === 'dark'
      ? { bg: 'rgba(255,255,255,0.03)', text: '#cbd5e1' }
      : { bg: '#f8fafc', text: '#334155' }
  }
  const t = Math.min(1, Math.abs(net) / maxAbs)
  if (theme === 'dark') {
    if (net >= 0) {
      const a = 0.16 + t * 0.42
      return { bg: `rgba(16,185,129,${a})`, text: t > 0.48 ? '#f8fafc' : '#d1fae5' }
    }
    const a = 0.18 + t * 0.48
    return { bg: `rgba(59,130,246,${a})`, text: t > 0.48 ? '#f8fafc' : '#dbeafe' }
  }
  if (net >= 0) {
    const a = 0.12 + t * 0.55
    return { bg: `rgba(239,68,68,${a})`, text: t > 0.55 ? '#fff' : '#7f1d1d' }
  }
  const a = 0.12 + t * 0.55
  return { bg: `rgba(59,130,246,${a})`, text: t > 0.55 ? '#fff' : '#1e3a8a' }
}
