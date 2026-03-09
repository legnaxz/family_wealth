import { OwnerScope, owners } from '../lib/ui'

export function OwnerTabs({ value, onChange }: { value: OwnerScope; onChange: (value: OwnerScope) => void }) {
  return (
    <div className='inline-flex flex-wrap gap-2 rounded-full border border-white/10 bg-slate-950/70 p-1'>
      {owners.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            onClick={() => onChange(item.value)}
            className={active ? 'rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-white/90' : 'rounded-full px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white'}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
