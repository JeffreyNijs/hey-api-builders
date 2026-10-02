/** The approved mascot master, posed per frame: gaze, blinks, mouth, hops and lean. */
import { readFileSync } from 'node:fs';
import { clamp, lastIndex, type Point } from './kit.ts';

const master = readFileSync(new URL('../brand/mascot.svg', import.meta.url), 'utf8');

const parts = {
  character: /<g id="character" transform="[^"]*">/,
  eyes: /<g id="eyes" transform="[^"]*">/,
  pupils: /<g id="pupils" fill="([^"]*)" transform="[^"]*">/,
  mouth: /(<g id="mouth"[^>]*>).*?(<\/g>)/s,
};
for (const [name, pattern] of Object.entries(parts)) {
  if (!pattern.test(master)) {
    throw new Error(`The mascot master no longer has an animatable ${name} group.`);
  }
}
const geometry = master.replace(/^.*?<\/desc>/s, '').replace(/<\/svg>\s*$/, '');

/** Master drawing units: the art is authored in a 240-unit square, standing on y = 183. */
const UNITS = 240;
const FEET = { x: 120, y: 183 };
const EYES = { x: 117, y: 109 };
const RIGHT_PUPIL = { x: 139.5, y: 105.5, rx: 9.2, ry: 13.8, rotate: -4 };
const CHEEK = { x: 159, y: 122, rx: 10, ry: 7 };
const CHEEK_MARGIN = 5;

export type Mouth = 'smile' | 'grin' | 'open' | 'worried';

const mouths: Record<Mouth, string> = {
  smile: '<path d="M110.8 132.9C115.5 136.8 125.7 138 129 129.8" fill="none" stroke-width="6.8"/>',
  grin: '<path d="M108.5 130.5C113.5 140.5 127.5 141.5 131.5 128" fill="none" stroke-width="6.8"/>',
  open: '<ellipse cx="120" cy="134.5" rx="6.2" ry="7.6" fill="#152725" stroke="none"/>',
  worried: '<path d="M111.5 136C116 132.6 124.5 132.4 129 135.4" fill="none" stroke-width="6.4"/>',
};

/** True when the right eye, offset by the gaze, would touch or tuck under the blush. */
function touchesCheek(dx: number, dy: number) {
  const angle = (RIGHT_PUPIL.rotate * Math.PI) / 180;
  const cx = RIGHT_PUPIL.x + dx;
  const cy = RIGHT_PUPIL.y + dy;
  for (let step = 0; step < 72; step += 1) {
    const theta = (step / 72) * Math.PI * 2;
    const ex = RIGHT_PUPIL.rx * Math.cos(theta);
    const ey = RIGHT_PUPIL.ry * Math.sin(theta);
    const x = cx + ex * Math.cos(angle) - ey * Math.sin(angle);
    const y = cy + ex * Math.sin(angle) + ey * Math.cos(angle);
    const nx = (x - CHEEK.x) / (CHEEK.rx + CHEEK_MARGIN);
    const ny = (y - CHEEK.y) / (CHEEK.ry + CHEEK_MARGIN);
    if (nx * nx + ny * ny < 1) {
      return true;
    }
  }
  return false;
}

/** Shorten a gaze offset until the eyes stay clear of the blush. */
export function safeGaze(dx: number, dy: number): Point {
  if (!touchesCheek(dx, dy)) {
    return { x: dx, y: dy };
  }
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 14; iteration += 1) {
    const middle = (low + high) / 2;
    if (touchesCheek(dx * middle, dy * middle)) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return { x: dx * low, y: dy * low };
}

export interface MascotPose {
  /** Top-left of the 240-unit drawing square on screen. */
  x: number;
  y: number;
  size: number;
  look: Point;
  /** 0 is open, 1 is closed. */
  blink?: number;
  mouth?: Mouth;
  /** Upward jump in screen pixels. */
  hop?: number;
  /** Positive squashes, negative stretches. */
  squash?: number;
}

/** Where the mascot's eyes are on screen, for gaze maths in the videos. */
export const eyeCentre = (pose: Pick<MascotPose, 'x' | 'y' | 'size'>): Point => ({
  x: pose.x + (EYES.x * pose.size) / UNITS,
  y: pose.y + (EYES.y * pose.size) / UNITS,
});

const num = (value: number) => String(Math.round(value * 1000) / 1000);

export function mascot(pose: MascotPose): string {
  const scale = pose.size / UNITS;
  const eyes = eyeCentre(pose);
  const dx = pose.look.x - eyes.x;
  const dy = pose.look.y - eyes.y;
  const distance = Math.hypot(dx, dy) || 1;
  const reach = clamp(distance / 320);
  const gaze = safeGaze((dx / distance) * 9 * reach, clamp((dy / distance) * 7 * reach, -7, 4.5));
  const lean = clamp(dx / 1400, -1, 1) * 4;
  const squash = pose.squash ?? 0;
  const hop = (pose.hop ?? 0) / scale;
  const blink = clamp(pose.blink ?? 0);
  const eyeScale = 1 - blink * 0.9;

  const posed = geometry
    .replace(
      parts.character,
      `<g transform="translate(${FEET.x} ${FEET.y}) rotate(${num(lean)}) scale(${num(1 + squash * 0.06)} ${num(1 - squash * 0.08)}) translate(${-FEET.x} ${-FEET.y}) translate(0 ${num(-hop)})">`
    )
    .replace(
      parts.eyes,
      `<g transform="translate(0 ${EYES.y}) scale(1 ${num(eyeScale)}) translate(0 ${-EYES.y})">`
    )
    .replace(parts.pupils, `<g fill="$1" transform="translate(${num(gaze.x)} ${num(gaze.y)})">`)
    .replace(parts.mouth, `$1${mouths[pose.mouth ?? 'smile']}$2`)
    .replace(/ id="[^"]*"/g, '');
  return `<g transform="translate(${num(pose.x)} ${num(pose.y)}) scale(${num(scale)})">${posed}</g>`;
}

/** Deterministic blink amount at `t` for a list of blink start times. */
export function blinkAt(t: number, starts: readonly number[], duration = 0.16) {
  const start = starts[lastIndex(starts, (candidate) => candidate <= t)];
  if (start === undefined || t > start + duration) {
    return 0;
  }
  return Math.sin(((t - start) / duration) * Math.PI);
}

/** Hop and squash for a list of reaction times: anticipate, jump, land. */
export function hopAt(t: number, starts: readonly number[], height = 16) {
  const start = starts[lastIndex(starts, (candidate) => candidate <= t)];
  const breathing = Math.sin((t / 2.6) * Math.PI * 2) * 0.12;
  if (start === undefined) {
    return { hop: 0, squash: breathing };
  }
  const p = (t - start) / 0.55;
  if (p > 1) {
    return { hop: 0, squash: breathing };
  }
  if (p < 0.14) {
    return { hop: 0, squash: Math.sin((p / 0.14) * (Math.PI / 2)) * 0.9 };
  }
  if (p < 0.74) {
    const air = (p - 0.14) / 0.6;
    return { hop: Math.sin(air * Math.PI) * height, squash: -0.45 * Math.sin(air * Math.PI) };
  }
  const land = (p - 0.74) / 0.26;
  return { hop: 0, squash: Math.sin(land * Math.PI) * 0.55 };
}
