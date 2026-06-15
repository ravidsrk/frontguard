import './global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | Frontguard Docs',
    default: 'Frontguard Docs',
  },
  description:
    'AI-powered frontend visual regression testing for web teams — detect, understand, and fix visual bugs before they ship to production.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="font-sans"
        style={{
          fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
        }}
      >
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
