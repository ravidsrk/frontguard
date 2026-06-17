import { Outlet } from 'react-router-dom';
import { Nav } from '../components/ui/Nav';
import { Footer } from '../components/ui/Footer';

/** Shell for the five marketing routes: sticky Nav + page outlet + shared Footer. */
export function MarketingLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <Nav />
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export default MarketingLayout;
