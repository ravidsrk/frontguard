import { useInView } from '../hooks/useInView';

interface FeatureSnippet {
  filename: string;
  lines: { text: string; tone?: 'add' | 'remove' | 'ai' | 'muted' | 'success' | 'danger' | 'cta' }[];
}

interface Feature {
  eyebrow: string;
  title: string;
  description: string;
  snippet: FeatureSnippet;
}

const features: Feature[] = [
  {
    eyebrow: 'Anti-flake consensus',
    title: 'Three captures, majority wins.',
    description:
      'Each route is rendered three times. Spinners mid-animation, font flicker, blinking carets — anything that disagrees with itself is dropped before the diff is even computed. SSIM perceptual matching is the fallback when pixel-equality is too strict.',
    snippet: {
      filename: 'frontguard.config.ts',
      lines: [
        { text: 'export default defineConfig({' },
        { text: '  antiFlakeRenders: 3,', tone: 'add' },
        { text: '  consensus: "majority",', tone: 'add' },
        { text: '  fallback: { ssim: 0.98 },', tone: 'muted' },
        { text: '});' },
      ],
    },
  },
  {
    eyebrow: 'AI classification',
    title: 'Tells you why, not just where.',
    description:
      'Surviving diffs go to GPT-4o / Claude Sonnet vision with the DOM, console errors and axe-core findings inline. The model returns a category, confidence score and explanation — on your own OpenAI or Anthropic key.',
    snippet: {
      filename: 'regression-report.md',
      lines: [
        { text: '/checkout @ 375px chromium — REGRESSION', tone: 'danger' },
        { text: 'AI · category: layout · confidence: 0.91', tone: 'ai' },
        { text: '  Submit button overflows the flex container', tone: 'ai' },
        { text: '  because padding jumped 16→24px in', tone: 'ai' },
        { text: '  Button.module.css:42.', tone: 'ai' },
      ],
    },
  },
  {
    eyebrow: 'Sandbox-verified fixes',
    title: "We don't ship a fix unless we tried it.",
    description:
      'Every AI patch is applied in a local Playwright sandbox (or Daytona snapshot when configured), the page is re-rendered, and the suggestion only ships if the diff disappears. No "try this and see" patches in your PR.',
    snippet: {
      filename: 'Button.module.css',
      lines: [
        { text: '- padding: 24px;', tone: 'remove' },
        { text: '+ padding: 16px;', tone: 'add' },
        { text: '', tone: 'muted' },
        { text: 'sandbox: ✔ re-render cleared the diff', tone: 'success' },
      ],
    },
  },
  {
    eyebrow: 'Plugin architecture',
    title: '6 lifecycle hooks, real plugins included.',
    description:
      'onDiscover · onBeforeCapture · onAfterCapture · onBeforeDiff · onAfterDiff · onReport. Built-ins: axe-core accessibility, Figma compare, performance budgets, monitor, third-party-script drift detection.',
    snippet: {
      filename: 'plugins.ts',
      lines: [
        { text: "import { createAccessibilityPlugin }", tone: 'ai' },
        { text: "  from '@frontguard/cli/plugins';", tone: 'ai' },
        { text: '' },
        { text: 'plugins: [', tone: 'muted' },
        { text: '  createAccessibilityPlugin(),', tone: 'add' },
        { text: ']', tone: 'muted' },
      ],
    },
  },
  {
    eyebrow: 'CI-native',
    title: 'GitHub Action + PR comment, no signup.',
    description:
      'Composite GitHub Action; baseline / current / diff thumbnails posted as a single update-in-place PR comment. Status check sets pass/fail. Works on GitLab CI, CircleCI, Jenkins via the same CLI.',
    snippet: {
      filename: '.github/workflows/visual.yml',
      lines: [
        { text: '- uses: ravidsrk/frontguard@v1', tone: 'cta' },
        { text: '  with:', tone: 'muted' },
        { text: '    url: ${{ steps.preview.outputs.url }}', tone: 'muted' },
        { text: '  env:', tone: 'muted' },
        { text: '    FRONTGUARD_OPENAI_KEY: ${{ secrets.OPENAI_KEY }}', tone: 'muted' },
      ],
    },
  },
  {
    eyebrow: 'Self-hostable',
    title: 'MIT. The cloud is optional.',
    description:
      'The CLI is fully self-contained: git-orphan baselines, local sandbox, your own AI key. The hosted cloud (D1 / R2 / Workers) adds team baselines, history and flake-score badges — and the same stack runs under docker-compose on your laptop.',
    snippet: {
      filename: 'docker-compose.yml',
      lines: [
        { text: 'services:', tone: 'muted' },
        { text: '  cloud-api:', tone: 'add' },
        { text: '    image: ghcr.io/ravidsrk/frontguard-cloud', tone: 'add' },
        { text: '    ports: ["8787:8787"]', tone: 'muted' },
      ],
    },
  },
];

const toneClass: Record<string, string> = {
  add: 'text-[var(--color-success)]',
  remove: 'text-[var(--color-danger)]',
  ai: 'text-[var(--color-accent)]',
  muted: 'text-[var(--color-text-muted)]',
  success: 'text-[var(--color-success)]',
  danger: 'text-[var(--color-danger)]',
  cta: 'text-[var(--color-cta)]',
};

function Snippet({ snippet }: { snippet: FeatureSnippet }) {
  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      <div className="border-b border-[var(--color-border)] px-3 py-1.5 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
        {snippet.filename}
      </div>
      <pre className="overflow-x-auto p-3 font-[family-name:var(--font-mono)] text-[11px] leading-relaxed">
        <code>
          {snippet.lines.map((line, i) => (
            <div key={i} className={line.tone ? toneClass[line.tone] : 'text-[var(--color-text)]'}>
              {line.text || ' '}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

export default function Features() {
  const { ref, inView } = useInView();

  return (
    <section
      ref={ref}
      id="features"
      aria-labelledby="features-heading"
      className="border-t border-[var(--color-border)] py-24 lg:py-32"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className={`max-w-3xl ${inView ? 'animate-fade-up' : 'opacity-0'}`}>
          <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
            What's in the box
          </p>
          <h2
            id="features-heading"
            className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-[var(--color-text)] [text-wrap:balance] sm:text-3xl md:text-4xl"
          >
            Six features built for the problems{' '}
            <span className="text-[var(--color-text-secondary)]">pixel diffs can{'’'}t solve.</span>
          </h2>
        </div>

        <div className="mt-12 grid gap-5 sm:mt-14 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <article
              key={feature.eyebrow}
              className={`flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 transition-[border-color,background-color] hover:border-[var(--color-border-bright)] hover:bg-[var(--color-bg-card-hover)] ${inView ? 'animate-fade-up' : 'opacity-0'}`}
              style={{ animationDelay: `${100 + i * 80}ms` }}
            >
              <span className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[var(--color-accent)]">
                {feature.eyebrow}
              </span>
              <h3 className="mt-3 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--color-text)] [text-wrap:balance]">
                {feature.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {feature.description}
              </p>
              <div className="mt-auto">
                <Snippet snippet={feature.snippet} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
