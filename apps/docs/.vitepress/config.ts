import { defineConfig } from 'vitepress';
export default defineConfig({
  title: 'Frontguard',
  description: 'AI-powered frontend visual regression testing',
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Config', link: '/config/' },
      { text: 'GitHub', link: 'https://github.com/ravidsrk/frontguard' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is Frontguard?', link: '/guide/what-is-frontguard' },
          { text: 'Getting Started', link: '/guide/getting-started' },
        ],
      },
      {
        text: 'Features',
        items: [
          { text: 'Route Discovery', link: '/guide/route-discovery' },
          { text: 'Visual Comparison', link: '/guide/visual-comparison' },
          { text: 'AI Analysis', link: '/guide/ai-analysis' },
          { text: 'Smart Rendering', link: '/guide/smart-rendering' },
          { text: 'GitHub Action', link: '/guide/github-action' },
          { text: 'Preview Deployments', link: '/guide/preview-deployments' },
        ],
      },
      {
        text: 'Configuration',
        items: [
          { text: 'Config Reference', link: '/config/' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/ravidsrk/frontguard' },
    ],
    footer: { message: 'Released under the MIT License.', copyright: 'Copyright © 2026 Frontguard' },
  },
});
