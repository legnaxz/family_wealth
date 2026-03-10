export function PrivacyToggle({ masked, onToggle }: { masked: boolean; onToggle: () => void }) {
  return (
    <button
      type='button'
      onClick={onToggle}
      className='inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background/80 px-4 text-sm font-medium text-foreground shadow-sm transition hover:bg-accent hover:text-accent-foreground'
    >
      <span className='text-base'>{masked ? '☁️' : '👁️'}</span>
      <span>{masked ? '프라이버시 ON' : '프라이버시 OFF'}</span>
    </button>
  )
}
