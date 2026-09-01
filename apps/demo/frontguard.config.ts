export default {
  version: 1,
  baseUrl: process.env.PREVIEW_URL || 'http://127.0.0.1:3000',
  routes: [
    { path: '/' },
    { path: '/pricing' },
    { path: '/about' },
  ],
  viewports: [375, 1440],
  browsers: ['chromium'],
  threshold: 0.01,
};
