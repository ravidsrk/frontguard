import app from './index.js';

// Graceful shutdown
const shutdown = () => {
  console.log('[frontguard-api] Shutting down gracefully...');
  // In-flight requests will complete; Hono handles this natively
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default {
  async fetch(request: Request, env: Record<string, string>) {
    return app.fetch(request, env);
  },
};
