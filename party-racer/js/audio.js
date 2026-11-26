// 簡單的音效（用 Web Audio 現場合成，不需要音檔）

let ctx = null;
let muted = false;

export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { /* 不支援就安靜 */ }
}

export function setMuted(v) { muted = v; }
export function isMuted() { return muted; }

function tone(freq, dur, { type = 'square', vol = 0.12, at = 0, slide = 0 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  count: () => tone(440, 0.18),
  go: () => tone(880, 0.5, { vol: 0.15 }),
  lap: () => { tone(660, 0.1, { type: 'triangle' }); tone(990, 0.15, { type: 'triangle', at: 0.1 }); },
  finish: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.15, at: i * 0.12 })),
  bump: () => tone(120, 0.12, { type: 'sawtooth', vol: 0.08, slide: 0.5 }),
  join: () => { tone(520, 0.08, { type: 'triangle' }); tone(780, 0.12, { type: 'triangle', at: 0.08 }); },
};
