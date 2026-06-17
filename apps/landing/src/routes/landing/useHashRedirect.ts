import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/*
  Legacy-hash redirect shim (decisions 2–3). The old single-page site had
  `/#pricing`, `/#faq`, and `/#comparison` anchors; pricing and the full
  comparison have since moved to their own routes. Inbound links to those hashes
  are mapped to the new routes so they don't dead-scroll on `/`.

  The floor's stable on-page anchors (parity spec §7 row 2) still live on this
  page and are intentionally absent from the map so the browser scrolls to them
  natively: `#main-content` (layout skip target), `#demo` (Hero), `#problem`
  (ProblemStrip), `#how-it-works` (Pipeline), `#features` (Features), `#install`
  (InstallTabs), `#validation` (Validation), plus the design's `#compare`
  summary and `#top`. Only the three cross-route hashes below redirect.
*/
export const LEGACY_HASH_MAP: Record<string, string> = {
  '#pricing': '/pricing',
  '#faq': '/pricing#faq',
  '#comparison': '/comparisons',
};

export function useHashRedirect() {
  const { hash } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const target = LEGACY_HASH_MAP[hash];
    if (target) {
      navigate(target, { replace: true });
    }
  }, [hash, navigate]);
}

export default useHashRedirect;
