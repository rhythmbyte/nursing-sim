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
