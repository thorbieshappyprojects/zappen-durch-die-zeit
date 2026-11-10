/**
 * TV sound effects, synthesized with the Web Audio API (no sound files, so no licences):
 * relay click + static burst when switching channels, a "thunk" with the fading 15 625 Hz
 * line-transformer whine of a CRT when switching on.
 *
 * The AudioContext is created on the first call, which always happens after a user gesture
 * (power button, key press), so browsers allow it.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noise(a: AudioContext, seconds: number): AudioBufferSourceNode {
  const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * seconds), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buffer;
  return src;
}

function envelope(a: AudioContext, peak: number, attack: number, release: number): GainNode {
  const g = a.createGain();
  const t = a.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  g.connect(a.destination);
  return g;
}

/** Relay click and a short burst of static (same 180 ms as the picture's static). */
export function playSwitch(): void {
  const a = audio();
  if (!a) return;
  const click = noise(a, 0.02);
  const hp = a.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2500;
  click.connect(hp).connect(envelope(a, 0.5, 0.001, 0.015));
  click.start();
  const hiss = noise(a, 0.2);
  const bp = a.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3000;
  bp.Q.value = 0.6;
  hiss.connect(bp).connect(envelope(a, 0.18, 0.005, 0.175));
  hiss.start();
}

/** Switching on: a low thunk, then the CRT whine fading away. */
export function playPowerOn(): void {
  const a = audio();
  if (!a) return;
  const thunk = a.createOscillator();
  thunk.type = "sine";
  thunk.frequency.setValueAtTime(90, a.currentTime);
  thunk.frequency.exponentialRampToValueAtTime(40, a.currentTime + 0.25);
  thunk.connect(envelope(a, 0.6, 0.005, 0.3));
  thunk.start();
  thunk.stop(a.currentTime + 0.4);
  const whine = a.createOscillator();
  whine.frequency.value = 15625; // PAL line frequency
  whine.connect(envelope(a, 0.02, 0.2, 2.5));
  whine.start();
  whine.stop(a.currentTime + 3);
}
