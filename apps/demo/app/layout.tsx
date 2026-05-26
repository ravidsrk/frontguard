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
  return (
    <html lang="en">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body className="bg-gray-950 text-white antialiased">
        <nav className="border-b border-gray-800 px-6 py-4">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <a href="/" className="text-xl font-bold text-indigo-400">
              Acme Inc
            </a>
            <div className="flex gap-6 text-sm text-gray-400">
              <a href="/" className="hover:text-white transition">Home</a>
              <a href="/pricing" className="hover:text-white transition">Pricing</a>
              <a href="/about" className="hover:text-white transition">About</a>
            </div>
          </div>
        </nav>
        <main>{children}</main>
        <footer className="border-t border-gray-800 px-6 py-8 text-center text-sm text-gray-500">
          © 2025 Acme Inc. Visual testing powered by{' '}
          <a href="https://github.com/ravidsrk/frontguard" className="text-indigo-400 hover:underline">
            Frontguard
          </a>
        </footer>
      </body>
    </html>
  );
}
