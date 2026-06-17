import { Link } from 'react-router-dom';
import { ComparisonTable, SectionHeader } from '../../../components/ui';
import { COMPARISON_COLUMNS, COMPARISON_ROWS } from '../data';

/*
  5-vendor comparison summary (decision 3). The full 11-row, 6-tool matrix lives
  on /comparisons; this is the design's landing subset, with a link through to
  the complete page. `id="compare"` preserves the design's in-page anchor (the
  legacy `#comparison` hash redirects to /comparisons via the page's hash shim).
*/
export function ComparisonSummary() {
  return (
    <section id="compare" className="mx-auto max-w-[1200px] scroll-mt-20 px-7 py-[84px]">
      <SectionHeader
        kicker="// HOW IT COMPARES"
        kickerTone="amber"
        title="The only one with AI fix verification."
        as="h2"
      />
      <ComparisonTable
        className="mt-10 border border-border-card"
        columns={COMPARISON_COLUMNS}
        rows={COMPARISON_ROWS}
        highlightColumn={1}
        caption="How Frontguard compares with Percy, Chromatic, BackstopJS, and Lost Pixel across seven core capabilities."
      />
      <Link
        to="/comparisons"
        className="mt-6 inline-flex items-center gap-2 font-mono text-[13px] text-amber transition-colors duration-[180ms] hover:text-amber-hover"
      >
        See all 11 capabilities across 6 tools →
      </Link>
    </section>
  );
}

export default ComparisonSummary;
