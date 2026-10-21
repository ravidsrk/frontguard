// The CLI calls process.exit() after console.log of the run JSON.
// A large stdout buffer (regression diffs) is dropped on that exit,
// so the harness would see exit 1 and an empty body. Drain first.
const orig = process.exit;

process.exit = (code = 0) => {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    orig(code);
  };
  let pending = 0;
  for (const stream of [process.stdout, process.stderr]) {
    if (stream.writableLength > 0) {
      pending += 1;
      stream.write('', () => {
        pending -= 1;
        if (pending === 0) finish();
      });
    }
  }
  if (pending === 0) finish();
  setTimeout(finish, 5000).unref();
};
