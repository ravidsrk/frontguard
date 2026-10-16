import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Frontguard Demo',
  description: 'A demo app for visual regression testing with Frontguard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const negativeControl = process.env.FRONTGUARD_DEMO_NEGATIVE_CONTROL === '1';

  return (
    <html lang="en">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body className="bg-[#0d0c0b] bg-stone-950 text-stone-100 antialiased">
        <nav className="border-b border-stone-800 px-6 py-4">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <a href="/" className="text-xl font-bold text-amber-400">
              Acme Inc
            </a>
            <div className="flex gap-6 text-sm text-stone-400">
              <a href="/" className="hover:text-white transition">Home</a>
              <a href="/pricing" className="hover:text-white transition">Pricing</a>
              <a href="/about" className="hover:text-white transition">About</a>
            </div>
          </div>
        </nav>
        <main
          data-frontguard-negative-control={negativeControl ? 'enabled' : undefined}
          style={negativeControl ? { transform: 'translateX(160px)' } : undefined}
        >
          {children}
        </main>
        <footer className="border-t border-stone-800 px-6 py-8 text-center text-sm text-stone-500">
          © 2025 Acme Inc. Visual testing powered by{' '}
          <a href="https://github.com/ravidsrk/frontguard" className="text-amber-400 hover:underline">
            Frontguard
          </a>
        </footer>
      </body>
    </html>
  );
}
