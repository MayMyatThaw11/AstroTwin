import { useEffect } from 'react'
import { Hero } from './Hero'
import { LandingHeader } from './LandingHeader'
import { ProductPreview } from './ProductPreview'
import { Capabilities, FinalCta, HazardsSection, HowItWorks, LandingFooter } from './Sections'
import './landing.css'

export default function Landing() {
  useEffect(() => {
    document.documentElement.classList.add('landing-page')
    document.title = 'AstroTwin AI | Your Health. Beyond Earth.'
    return () => document.documentElement.classList.remove('landing-page')
  }, [])

  return (
    <div className="landing relative">
      <LandingHeader />
      <main>
        <Hero />
        <HazardsSection />
        <HowItWorks />
        <Capabilities />
        <ProductPreview />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  )
}
