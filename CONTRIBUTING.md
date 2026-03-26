# Contributing to Frontguard

Thanks for your interest in contributing! Here's how to get started.

## Development setup

```bash
# Clone the repo
git clone https://github.com/ravidsrk/frontguard.git
cd frontguard

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install --with-deps chromium

# Build
npm run build

# Run tests
npm test
```

## Project structure

```
src/
├── cli/          # CLI entry point and commands
├── core/         # Pipeline orchestration
├── discovery/    # Route discovery (crawl, filesystem, manual)
├── capture/      # Screenshot capture via Playwright
├── comparison/   # Pixel diff via pixelmatch
├── ai/           # AI analysis (OpenAI, Anthropic)
├── reporting/    # Report generation and PR comments
└── utils/        # Shared utilities
```

## Running in development

```bash
# Watch mode — rebuilds on changes
npm run dev

# Run against a local app
node dist/cli/index.js run --url http://localhost:3000

# Type checking
npm run lint
```

## Tests

```bash
# Run all tests
npm test

# Run specific test file
npx vitest src/comparison/pixelmatch.test.ts

# Watch mode
npx vitest --watch
```

## Submitting a PR

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Add or update tests as needed
4. Run `npm test` and `npm run lint` — ensure both pass
5. Write a clear PR description explaining what and why
6. Submit the PR

## Code style

- TypeScript strict mode
- No `any` types without justification
- Prefer named exports
- Keep functions small and focused

## Reporting bugs

Open an issue with:
- Frontguard version (`npx frontguard --version`)
- Node.js version
- Operating system
- Steps to reproduce
- Expected vs actual behavior

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
