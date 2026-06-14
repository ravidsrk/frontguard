import { lazy, Suspense } from 'react';
import Nav from './components/Nav';
import Hero from './components/Hero';

const Problem = lazy(() => import('./components/Problem'));
const HowItWorks = lazy(() => import('./components/HowItWorks'));
const Features = lazy(() => import('./components/Features'));
const Comparison = lazy(() => import('./components/Comparison'));
const QuickStart = lazy(() => import('./components/QuickStart'));
const Validation = lazy(() => import('./components/Validation'));
const Pricing = lazy(() => import('./components/Pricing'));
const FAQ = lazy(() => import('./components/FAQ'));
const Footer = lazy(() => import('./components/Footer'));

const SectionSkeleton = () => (
  <div className="min-h-[40vh] flex items-center justify-center">
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
        {/* Hero contains the inline demo asset (#demo target lives inside Hero) */}
        <div id="demo">
          <Hero />
        </div>
        <Suspense fallback={<SectionSkeleton />}>
          <Problem />
          <HowItWorks />
          <Features />
          <Comparison />
          <QuickStart />
          <Validation />
          <Pricing />
          <FAQ />
        </Suspense>
      </main>
      <Suspense fallback={<SectionSkeleton />}>
        <Footer />
      </Suspense>
    </>
  );
}
