import { lazy, Suspense } from 'react';
import Nav from './components/Nav';
import Hero from './components/Hero';

const SocialProof = lazy(() => import('./components/SocialProof'));
const Problem = lazy(() => import('./components/Problem'));
const HowItWorks = lazy(() => import('./components/HowItWorks'));
const Features = lazy(() => import('./components/Features'));
const Comparison = lazy(() => import('./components/Comparison'));
const GettingStarted = lazy(() => import('./components/GettingStarted'));
const FinalCTA = lazy(() => import('./components/FinalCTA'));
const Footer = lazy(() => import('./components/Footer'));

const SectionSkeleton = () => (
  <div className="min-h-[50vh] flex items-center justify-center">
    <div className="w-8 h-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
  </div>
);

export default function App() {
return (
<>
<a
href="#main-content"
className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-[var(--color-accent)] focus:px-4 focus:py-2 focus:text-[var(--color-bg)] focus:font-semibold"
>
Skip to main content
</a>
<Nav />
<main id="main-content">
<Hero />
<Suspense fallback={<SectionSkeleton />}>
<SocialProof />
<Problem />
<HowItWorks />
<Features />
<Comparison />
<GettingStarted />
<FinalCTA />
</Suspense>
</main>
<Suspense fallback={<SectionSkeleton />}>
<Footer />
</Suspense>
</>
);
}
