import { OwnerScope, owners } from '../lib/ui'

export function OwnerTabs({ value, onChange }: { value: OwnerScope; onChange: (value: OwnerScope) => void }) {
  return (
    <div style={{ display: 'inline-flex', gap: 6, padding: 4, border: '1px solid #cbd5e1', borderRadius: 999, background: '#fff' }}>
      {owners.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            onClick={() => onChange(item.value)}
            style={{
              border: 'none',
              borderRadius: 999,
              padding: '8px 12px',
              background: active ? '#0f172a' : 'transparent',
              color: active ? '#fff' : '#334155',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
