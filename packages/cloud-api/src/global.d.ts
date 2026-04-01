// Cloudflare Workers global crypto (Web Crypto API)
declare const crypto: {
  randomUUID(): string;
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  subtle: SubtleCrypto;
};
