import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{
        title: (
          <span className="font-mono font-medium text-cyan-400">
            frontguard
          </span>
        ),
        url: 'https://frontguard.dev',
      }}
      links={[
        {
          text: 'Website',
          url: 'https://frontguard.dev',
        },
        {
          text: 'GitHub',
          url: 'https://github.com/ravidsrk/frontguard',
          external: true,
        },
      ]}
    >
      {children}
    </DocsLayout>
  );
}
