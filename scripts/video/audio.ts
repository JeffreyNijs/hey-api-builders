/** Synthesized sound cues. Every sound is generated from code, so renders are reproducible. */

export type CueKind = 'key' | 'line' | 'pop' | 'whoosh' | 'success' | 'error' | 'chime';

export interface Cue {
  at: number;
  kind: CueKind;
}

const RATE = 48_000;

/** Small deterministic noise source, so no two renders differ. */
function noise(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 31 - 1;
  };
}

function tone(
  out: Float32Array,
  start: number,
  duration: number,
  frequency: (p: number) => number,
  gain: number,
  options: { attack?: number; harmonics?: readonly number[] } = {}
) {
  const first = Math.max(0, Math.round(start * RATE));
  const length = Math.round(duration * RATE);
  const attack = Math.max(1, Math.round((options.attack ?? 0.004) * RATE));
  const harmonics = options.harmonics ?? [1];
  let phase = 0;
  for (let index = 0; index < length && first + index < out.length; index += 1) {
    const p = index / length;
    phase += (2 * Math.PI * frequency(p)) / RATE;
    const envelope = Math.min(1, index / attack) * (1 - p) ** 2.2;
    let sample = 0;
    harmonics.forEach((weight, harmonic) => {
      sample += weight * Math.sin(phase * (harmonic + 1));
    });
    out[first + index] = (out[first + index] ?? 0) + sample * envelope * gain;
  }
}

function hiss(out: Float32Array, start: number, duration: number, gain: number, seed: number) {
  const random = noise(seed);
  const first = Math.max(0, Math.round(start * RATE));
  const length = Math.round(duration * RATE);
  let low = 0;
  for (let index = 0; index < length && first + index < out.length; index += 1) {
    const p = index / length;
    // A dark one-pole low-pass that opens and closes, so the hiss sweeps like soft air.
    const cutoff = 0.012 + 0.06 * Math.sin(p * Math.PI);
    low += cutoff * (random() - low);
    out[first + index] = (out[first + index] ?? 0) + low * Math.sin(p * Math.PI) * gain;
  }
}

function render(out: Float32Array, cue: Cue, index: number) {
  switch (cue.kind) {
    case 'key':
      tone(out, cue.at, 0.03, () => 1700 + (index % 5) * 90, 0.045, { attack: 0.001 });
      break;
    case 'line':
      tone(out, cue.at, 0.05, () => 980, 0.06, { attack: 0.001 });
      break;
    case 'pop':
      tone(out, cue.at, 0.11, (p) => 460 + 520 * Math.sqrt(p), 0.14, { harmonics: [1, 0.2] });
      break;
    case 'whoosh':
      // Noise reads far louder than a tone at the same level, so it sits well under the pops.
      hiss(out, cue.at, 0.36, 0.24, 7_919 + index);
      break;
    case 'success':
      tone(out, cue.at, 0.2, () => 784, 0.13, { harmonics: [1, 0.25, 0.08] });
      tone(out, cue.at + 0.1, 0.32, () => 1175, 0.13, { harmonics: [1, 0.25, 0.08] });
      break;
    case 'error':
      for (const offset of [0, 0.13]) {
        tone(out, cue.at + offset, 0.11, () => 150, 0.09, {
          harmonics: [1, 0, 0.33, 0, 0.2, 0, 0.14],
        });
      }
      break;
    case 'chime':
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, note) => {
        tone(out, cue.at + note * 0.075, 0.7, () => frequency, 0.09, { harmonics: [1, 0.18] });
      });
      break;
  }
}

/** Mix cues into a 48 kHz mono 16-bit WAV file. */
export function synthesize(cues: readonly Cue[], duration: number): Buffer {
  const samples = new Float32Array(Math.ceil(duration * RATE));
  cues.forEach((cue, index) => render(samples, cue, index));
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => {
    data.writeInt16LE(Math.round(Math.tanh(sample * 1.2) * 0.9 * 32_767), index * 2);
  });
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
