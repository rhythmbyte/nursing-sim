// Coalesces bursts of store updates into one render per `ms` (trailing), so a busy sim (many actions per second, e.g.
// three students and the processors) re-renders heavy screens at most a few times a second. Returns { run, cancel }.
export function coalesce(fn, ms = 250) {
  let timer = null;
  let last = 0;
  const run = () => {
    const wait = Math.max(0, last + ms - Date.now());
    if (timer) return;
    timer = setTimeout(() => { timer = null; last = Date.now(); fn(); }, wait);
  };
  return { run, cancel: () => { clearTimeout(timer); timer = null; } };
}
