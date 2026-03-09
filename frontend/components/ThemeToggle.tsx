export function ThemeToggle({ theme, onToggle }: { theme: 'light' | 'dark'; onToggle: () => void }) {
  const dark = theme === 'dark'
  return (
    <button
      type='button'
      onClick={onToggle}
      className='inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background/80 px-4 text-sm font-medium text-foreground shadow-sm transition hover:bg-accent hover:text-accent-foreground'
    >
      <span className='text-base'>{dark ? '🌙' : '☀️'}</span>
      <span>{dark ? '다크 모드' : '라이트 모드'}</span>
    </button>
  )
}
