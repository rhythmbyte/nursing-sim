// Sim clock as a plain, serializable snapshot + pure functions. No DOM, no timers.
// Callers pass `now` (wall ms) in, so tests and a future server clock can drive it.
//
// snapshot: { status: 'ready'|'running'|'paused'|'ended', speed, baseMs, anchorWall }
//   baseMs     = sim milliseconds accumulated before the current running stretch
//   anchorWall = wall ms when the current running stretch began (null unless running)

export const SPEEDS = [0.5, 1, 2, 4, 8];

export function createClock(speed = 1) {
  return { status: 'ready', speed: SPEEDS.includes(speed) ? speed : 1, baseMs: 0, anchorWall: null };
}

export function simMs(c, now) {
  return c.status === 'running' ? c.baseMs + (now - c.anchorWall) * c.speed : c.baseMs;
}

export function simMinutes(c, now) {
  return simMs(c, now) / 60000;
}

export function start(c, now) {
  if (c.status !== 'ready') return c;
  return { ...c, status: 'running', anchorWall: now };
}

export function pause(c, now) {
  if (c.status !== 'running') return c;
  return { ...c, status: 'paused', baseMs: simMs(c, now), anchorWall: null };
}

export function resume(c, now) {
  if (c.status !== 'paused') return c;
  return { ...c, status: 'running', anchorWall: now };
}

export function end(c, now) {
  if (c.status === 'ended' || c.status === 'ready') return c;
  return { ...c, status: 'ended', baseMs: simMs(c, now), anchorWall: null };
}

export function setSpeed(c, speed, now) {
  if (!SPEEDS.includes(speed)) return c;
  // Re-anchor so time already elapsed keeps the old speed.
  if (c.status === 'running') return { ...c, speed, baseMs: simMs(c, now), anchorWall: now };
  return { ...c, speed };
}

/** Jump sim time to `toMin` (forward only). Keeps status; a running clock re-anchors at `now`. */
export function jumpTo(c, toMin, now) {
  const toMs = toMin * 60000;
  if (c.status === 'ready' || c.status === 'ended' || toMs <= simMs(c, now)) return c;
  return { ...c, baseMs: toMs, anchorWall: c.status === 'running' ? now : null };
}
