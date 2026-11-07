export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0A1D2E" />
      <ellipse cx="16" cy="16" rx="12.5" ry="5" fill="none" stroke="#B9E5E9" strokeOpacity=".55" strokeWidth="1.3" transform="rotate(-25 16 16)" />
      <path d="M6.5 17h5l2-5 3 9 2-6 1.6 2H25.5" fill="none" stroke="#52BFCC" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Wordmark() {
  return <span className="font-display text-base font-semibold tracking-tight">AstroTwin <span className="font-medium text-cyan">AI</span></span>
}
