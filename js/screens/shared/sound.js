// Short beeps (monitor alarms, call lights). Browsers only allow audio after a user gesture; failures are silent.
let ctx = null;

export function beep({ freq = 880, ms = 140, volume = 0.06, type = 'sine' } = {}) {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
  } catch { /* no audio available */ }
}
