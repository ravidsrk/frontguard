export default {
  baseUrl: process.env.PREVIEW_URL || 'http://localhost:3000',
  routes: [
    { path: '/' },
    { path: '/pricing' },
    { path: '/about' },
  ],
  viewports: [375, 1440],
  browsers: ['chromium'],
  threshold: 0.01,
  ai: { provider: 'openai' },
};
