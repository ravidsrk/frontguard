import { Button, CopyCommand, Mark } from '../../../components/ui';
import { REPO_URL } from '../../../lib/site';
import { BAND_Y } from '../../../lib/responsive';

/* Closing CTA band: shield + init copy row + primary/ghost CTAs. */
export function Cta() {
  return (
    <section className="border-t border-border-faint bg-surface-alt">
      <div className={`mx-auto max-w-[1200px] px-7 text-center ${BAND_Y}`}>
        <Mark height={52} seamColor="var(--color-surface-alt)" aria-hidden className="mb-7" />
        <h2 className="text-[clamp(2rem,6vw,2.75rem)] font-bold tracking-[-0.035em] text-ink-hi">
          Ship with confidence.
        </h2>
        <p className="mx-auto mt-4 max-w-[480px] text-[17px] leading-[1.55] text-ink-mid">
          Free forever. No per-screenshot pricing cliff, no dashboard lock-in. Install it and run
          your first check in two minutes.
        </p>
        <CopyCommand
          command="npx frontguard init --ci"
          className="mx-auto mt-8 max-w-[340px]"
          aria-label="Copy command: npx frontguard init --ci"
        />
        <div className="mt-6 flex flex-wrap justify-center gap-3.5">
          <Button href="/docs" size="lg">
            Read the docs →
          </Button>
          <Button href={REPO_URL} external variant="ghost" size="lg">
            ★ Star on GitHub
          </Button>
        </div>
      </div>
    </section>
  );
}

export default Cta;
