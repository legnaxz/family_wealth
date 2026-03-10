export function MaskedValue({ value, className = '' }: { value: string; className?: string }) {
  return (
    <span className={`group relative inline-flex cursor-default items-center ${className}`}>
      <span className='transition-opacity duration-200 group-hover:opacity-0'>{'●'.repeat(Math.max(6, Math.min(14, value.length)))}</span>
      <span className='absolute left-0 top-1/2 -translate-y-1/2 whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100'>
        {value}
      </span>
    </span>
  )
}
