// Waveform math for the bedside monitor. Pure (tested). Shapes come from data/catalogs/rhythms.json `draw`.
// tb = seconds since the current beat started; t = absolute seconds (drives fibrillation/VF noise).

const g = (x, mu, sigma, amp) => amp * Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));
const TAU = Math.PI * 2;

export function ecgSample(draw, tb, t) {
  switch (draw?.shape) {
    case 'flat': return 0.01 * Math.sin(t * 3);
    case 'vf': {
      const f = draw.vfFreq || 5;
      return 0.5 * Math.sin(TAU * f * t) * (0.6 + 0.4 * Math.sin(TAU * 0.7 * t)) + 0.2 * Math.sin(TAU * f * 1.7 * t + 1);
    }
    default: {
      const w = draw?.qrsWide ? 2.4 : 1;
      let v = 0;
      if (draw?.p) v += g(tb, 0.08, 0.025, 0.12);
      v += g(tb, 0.18, 0.008 * w, -0.12) + g(tb, 0.2, 0.012 * w, 1) + g(tb, 0.22, 0.01 * w, -0.25);
      v += g(tb, draw?.qrsWide ? 0.42 : 0.38, 0.045, draw?.qrsWide ? -0.3 : 0.28);
      if (draw?.fibAmp) v += draw.fibAmp * (Math.sin(TAU * 6.3 * t) + 0.6 * Math.sin(TAU * 9.1 * t + 0.5));
      return v;
    }
  }
}

/** Pleth (SpO₂) wave: upstroke after each beat, decay, small dicrotic notch. 0 without a pulse. */
export function plethSample(tb, pulse) {
  if (!pulse) return 0;
  const x = tb - 0.25;
  if (x < 0) return 0.08 * Math.exp(x * 4);
  if (x < 0.12) return x / 0.12;
  return Math.exp(-(x - 0.12) / 0.3) + g(x, 0.32, 0.03, 0.12);
}

/** Next R-R interval in seconds for a heart rate, with beat-to-beat irregularity (0–1) from the rhythm data. */
export function nextRR(hr, irregular = 0, rand = Math.random) {
  const base = 60 / Math.max(20, hr || 60);
  return base * (1 + (irregular ? (rand() - 0.5) * 2 * irregular : 0));
}
