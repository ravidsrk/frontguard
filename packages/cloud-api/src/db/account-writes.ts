/**
 * Per-account mutation queue.
 *
 * Account erasure and screenshot persistence for the same user must not
 * interleave inside one isolate. A write that is already inside `put` finishes
 * before erasure deletes objects, so the delete sees those bytes. The queue is
 * in-process. The durable lock row covers a second isolate.
 */

const tails = new Map<string, Promise<void>>();

/** Run `fn` after any in-flight mutation for `userId` in this process. */
export function withUserMutation<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(userId) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(userId, settled);
  void settled.then(() => {
    if (tails.get(userId) === settled) tails.delete(userId);
  });
  return run;
}
