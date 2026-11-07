// Warm-up for a freshly launched headless Chromium: the first DevTools evaluation after launch can stall, so
// all.sh makes one throwaway call (10 s limit) before each suite. Usage: node warm.mjs <page websocket url>
const sock = new WebSocket(process.argv[2]);
const done = (code) => { try { sock.close(); } catch { /* closed */ } process.exit(code); };
setTimeout(() => done(1), 10000);
sock.onopen = () => sock.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: '1+1', returnByValue: true } }));
sock.onmessage = () => done(0);
sock.onerror = () => done(1);
