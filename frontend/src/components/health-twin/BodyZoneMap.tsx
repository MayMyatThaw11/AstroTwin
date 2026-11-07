import type { KeyboardEvent } from 'react'

export type Zone = 'cognition' | 'cardio' | 'wellness' | 'msk'

export const ZONES: { id: Zone; label: string; short: string }[] = [
  { id: 'cognition', label: 'Sleep & cognition', short: 'Head' },
  { id: 'cardio', label: 'Cardiovascular', short: 'Chest' },
  { id: 'wellness', label: 'General wellness', short: 'Core' },
  { id: 'msk', label: 'Musculoskeletal', short: 'Limbs' },
]

// One half-body path, mirrored for the other side so the figure is exactly symmetric.
const ARM = 'M60 92 C46 96 40 112 38 136 L31 196 C29 210 33 218 41 218 C49 218 51 210 52 202 L62 150 L68 118 Z'
const LEG = 'M72 258 L108 258 L107 338 L103 432 C102 444 96 450 88 450 L76 450 C68 450 68 442 72 432 L76 338 Z'
const TORSO = 'M64 92 C64 80 80 78 100 76 L120 76 C140 78 156 80 156 92 L152 152 C150 188 146 222 150 258 L70 258 C74 222 70 188 68 152 Z'

const accent = (a: number) => `rgb(var(--accent) / ${a})`

interface Props { zone: Zone; onSelect: (z: Zone) => void }

export function BodyZoneMap({ zone, onSelect }: Props) {
  const props = (z: Zone, label: string) => ({
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    'aria-pressed': zone === z,
    onClick: () => onSelect(z),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(z) }
    },
    className: 'zone cursor-pointer outline-none [&:focus-visible>*]:stroke-[3]',
  })
  const look = (z: Zone) =>
    zone === z
      ? { fill: accent(0.32), stroke: accent(1), strokeWidth: 2 }
      : { fill: accent(0.07), stroke: 'rgb(var(--ink) / 0.35)', strokeWidth: 1.25 }

  const both = (d: string, z: Zone) => (
    <>
      <path d={d} {...look(z)} strokeLinejoin="round" />
      <path d={d} {...look(z)} strokeLinejoin="round" transform="translate(220 0) scale(-1 1)" />
    </>
  )

  return (
    <svg viewBox="0 0 220 470" className="mx-auto h-auto w-full max-w-[250px]" role="group" aria-label="Body map. Choose a zone to see related data.">
      <defs>
        <clipPath id="torso-clip"><path d={TORSO} /></clipPath>
        <radialGradient id="halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.16" />
          <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="110" cy="240" rx="108" ry="224" fill="url(#halo)" aria-hidden />
      <path d="M100 66 L120 66 L119 80 L101 80 Z" fill="none" stroke="rgb(var(--ink) / 0.35)" strokeWidth="1.25" aria-hidden />

      <g {...props('msk', 'Musculoskeletal: arms and legs')}>
        {both(ARM, 'msk')}
        {both(LEG, 'msk')}
      </g>

      <g {...props('wellness', 'General wellness: core')}>
        <g clipPath="url(#torso-clip)"><rect x="40" y="152" width="140" height="110" {...look('wellness')} /></g>
      </g>

      <g {...props('cardio', 'Cardiovascular: chest')}>
        <g clipPath="url(#torso-clip)"><rect x="40" y="70" width="140" height="82" {...look('cardio')} /></g>
        {/* heart glyph */}
        <path d="M110 138 C95 127 89 119 89 111 A10 10 0 0 1 110 107 A10 10 0 0 1 131 111 C131 119 125 127 110 138 Z"
          fill="none" stroke={zone === 'cardio' ? accent(1) : 'rgb(var(--dim))'} strokeWidth="1.5" strokeLinejoin="round" pointerEvents="none" />
      </g>
      <path d={TORSO} fill="none" stroke="rgb(var(--ink) / 0.45)" strokeWidth="1.5" strokeLinejoin="round" pointerEvents="none" />

      <g {...props('cognition', 'Sleep and cognition: head')}>
        <ellipse cx="110" cy="40" rx="23" ry="28" {...look('cognition')} />
        <path d="M116 31 a10 10 0 1 0 5 17 a8 8 0 0 1 -5 -17z" fill="none"
          stroke={zone === 'cognition' ? accent(1) : 'rgb(var(--dim))'} strokeWidth="1.5" strokeLinejoin="round" pointerEvents="none" />
      </g>
    </svg>
  )
}
