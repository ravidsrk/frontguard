export default function Home() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-24 text-center">
      {/* Hero */}
      <div className="mb-6 inline-block rounded-full bg-amber-500/10 px-4 py-1 text-sm text-amber-400">
        🚀 Now in public beta
      </div>
      <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl">
        Ship frontend changes<br />
        <span className="text-amber-400">without breaking things</span>
      </h1>
      <p className="mx-auto mb-10 max-w-2xl text-lg text-stone-400">
        Acme Inc helps engineering teams build, test, and deploy frontend
        applications with confidence. Visual regression testing catches UI bugs
        before your users do.
      </p>
      <div className="flex items-center justify-center gap-4">
        <a
          href="/pricing"
          className="rounded-lg bg-amber-500 px-6 py-3 font-semibold text-stone-950 transition hover:bg-amber-400"
        >
          Get Started Free
        </a>
        <a
          href="/about"
          className="rounded-lg border border-stone-700 px-6 py-3 font-semibold text-stone-300 transition hover:border-stone-500"
        >
          View Demo
        </a>
      </div>

      {/* Features */}
      <div className="mt-24 grid gap-8 sm:grid-cols-3 text-left">
        <div className="rounded-xl border border-stone-800 bg-stone-900 p-6">
          <div className="mb-3 text-2xl">🔍</div>
          <h3 className="mb-2 font-semibold text-white">Pixel-Perfect Diffs</h3>
          <p className="text-sm text-stone-400">
            Compare screenshots pixel by pixel across every page and viewport.
          </p>
        </div>
        <div className="rounded-xl border border-stone-800 bg-stone-900 p-6">
          <div className="mb-3 text-2xl">🤖</div>
          <h3 className="mb-2 font-semibold text-white">AI-Powered Analysis</h3>
          <p className="text-sm text-stone-400">
            GPT-4o explains what changed in plain English — not just pixel counts.
          </p>
        </div>
        <div className="rounded-xl border border-stone-800 bg-stone-900 p-6">
          <div className="mb-3 text-2xl">⚡</div>
          <h3 className="mb-2 font-semibold text-white">Zero Config</h3>
          <p className="text-sm text-stone-400">
            Auto-discovers routes. No test files to write. Works in any CI.
          </p>
        </div>
      </div>
    </div>
  );
}
