import { useEffect, useState } from 'react'
import { useTheme } from '../lib/theme'

// Local artwork, one file per theme (see public/images/README.txt). It is only mounted once it has
// loaded, so a missing file leaves the plain atmosphere behind instead of a broken image.
const SRC = { dark: '/images/astronaut-hero-dark.webp', light: '/images/astronaut-hero-light.webp' } as const

export function HeroArt() {
  const { theme } = useTheme()
  const src = SRC[theme]
  const [loaded, setLoaded] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const img = new Image()
    img.onload = () => { if (alive) setLoaded(src) }
    img.onerror = () => { if (alive) setLoaded(null) }
    img.src = src
    return () => { alive = false }
  }, [src])

  if (loaded !== src) return null
  return (
    <img
      src={src} width={746} height={783} decoding="async" {...{ fetchpriority: "high" }}
      alt="Astronaut in a spacesuit, helmet visor showing a heartbeat trace, with the moon behind"
      className="h-full w-full object-cover object-[62%_18%] lg:object-[50%_40%]"
    />
  )
}
