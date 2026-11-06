// Sim-time helpers. No DOM.
// Sim time = elapsed minutes from start (`atMin`). Display = shift clock ("07:00" + 75 → "08:15").

export function parseClock(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function formatShiftTime(startClock, simMin) {
  const total = (((parseClock(startClock) + Math.floor(simMin)) % 1440) + 1440) % 1440;
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** Shift length in minutes from start to end clock (wraps past midnight; equal clocks = 24 h). */
export function shiftLengthMin(startClock, endClock) {
  const d = (parseClock(endClock) - parseClock(startClock) + 1440) % 1440;
  return d === 0 ? 1440 : d;
}

/** "7h 45m left" / "12m left" (whole minutes, never negative). */
export function formatRemaining(min) {
  const m = Math.max(0, Math.ceil(min - 1e-9));
  const h = Math.floor(m / 60);
  return `${h ? `${h}h ` : ''}${m % 60}m left`;
}
