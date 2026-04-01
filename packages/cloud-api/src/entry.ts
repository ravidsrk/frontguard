import app from './index.js';
export default {
  async fetch(request: Request, env: Record<string, string>) {
    return app.fetch(request, env);
  },
};
