export function MaskedValue({ value, className = '', masked = true }: { value: string; className?: string; masked?: boolean }) {
  if (!masked) {
    return <span className={className}>{value}</span>
  }

  return (
    <span className={`relative inline-flex items-center overflow-hidden rounded-full px-2 py-0.5 ${className}`}>
      <span className='absolute inset-0 rounded-full bg-gradient-to-r from-slate-300/60 via-white/35 to-slate-300/60 blur-[6px] dark:from-slate-500/35 dark:via-white/10 dark:to-slate-500/35' />
      <span className='relative select-none tracking-[0.18em] text-slate-500 dark:text-slate-400'>✦ ✦ ✦</span>
    </span>
  )
}
