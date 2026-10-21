/**
 * Shared story include/exclude matching for Storybook, Ladle, and Histoire.
 *
 * A pattern matches when it equals the story id, globs the id, title, or
 * `title/name`, or is a case-insensitive prefix of the title.
 *
 * @module discovery/story-match
 */

/** True if the pattern is `*` or `**` (match everything). */
function isWildcard(pattern: string): boolean {
  return pattern === '*' || pattern === '**';
}

/**
 * Glob-ish matcher: `*` matches any run of characters that isn't `/`,
 * `**` matches anything (including `/`). Anchored to the full string.
 */
function globMatch(pattern: string, candidate: string): boolean {
  if (isWildcard(pattern)) return true;

  const escaped = pattern
    .replace(/[\\.+^${}()|[\]]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLESTAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLESTAR::/g, '.*')
    .replace(/\?/g, '.');
  try {
    return new RegExp(`^${escaped}$`, 'i').test(candidate);
  } catch {
    return false;
  }
}

export interface StoryMatchTarget {
  id: string;
  title?: string;
  name?: string;
}

/**
 * True when a story matches any of the supplied patterns.
 */
export function matchesAny(story: StoryMatchTarget, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const title = story.title ?? '';
  const titleAndName = `${title}/${story.name ?? ''}`;
  for (const raw of patterns) {
    const pattern = raw.trim();
    if (!pattern) continue;
    if (pattern === story.id) return true;
    if (globMatch(pattern, story.id)) return true;
    if (globMatch(pattern, title)) return true;
    if (globMatch(pattern, titleAndName)) return true;
    if (title.toLowerCase().startsWith(pattern.toLowerCase())) return true;
  }
  return false;
}
