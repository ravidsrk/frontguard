import type { Reporter } from '../core/types.js';
import { CompositeReporter } from './composite.js';
import { ConsoleReporter } from './console.js';
import { GitHubPRReporter } from './github-pr.js';
import { JSONReporter } from './json.js';

export function createReporter(format: string): Reporter {
  let reporter: Reporter;
  switch (format) {
    case 'json':
      reporter = new JSONReporter();
      break;
    case 'console':
    default:
      reporter = new ConsoleReporter();
      break;
  }

  const isPullRequest = /^refs\/pull\/\d+\/(?:merge|head)$/.test(
    process.env.GITHUB_REF ?? '',
  );
  if (
    process.env.GITHUB_ACTIONS === 'true' &&
    process.env.GITHUB_TOKEN &&
    process.env.GITHUB_REPOSITORY &&
    isPullRequest
  ) {
    return new CompositeReporter([reporter, new GitHubPRReporter()]);
  }

  return reporter;
}
