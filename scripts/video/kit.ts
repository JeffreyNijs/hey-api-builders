/** Drawing kit shared by the demo videos: palette, frame chrome, text, code and motion helpers. */
import { readFileSync } from 'node:fs';
import type { Cue } from './audio.ts';

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 30;

export const color = {
  paper: '#faf7ee',
  card: '#fffdf6',
  ink: '#152725',
  inkRaised: '#22382f',
  inkRule: '#2c443d',
  mint: '#b6ef86',
  mintSoft: '#e4f6d0',
  coral: '#f27b62',
  coralSoft: '#fcdcd3',
  muted: '#55655e',
  faint: '#8f9b95',
  rule: '#dedacd',
  codeDim: '#a6b5ae',
} as const;

export const SANS = 'Inter';
/** The no-ligature cut, so `<=`, `=>` and `...` look exactly as they are typed. */
export const MONO = 'JetBrains Mono NL';

/** JetBrains Mono NL advances are exactly 600/1000 em, so code columns map to exact pixels. */
export const monoWidth = (size: number) => size * 0.6;

/** Offset from a baseline to the visual middle of lowercase-and-capital text. */
export const midline = (size: number) => size * 0.35;

export const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));
export const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;

/** Progress of `t` through `[start, start + duration]`, clamped to 0–1. */
export const span = (t: number, start: number, duration: number) =>
  duration <= 0 ? (t >= start ? 1 : 0) : clamp((t - start) / duration);

export const ease = {
  out: (p: number) => 1 - (1 - p) ** 3,
  inOut: (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  back: (p: number) => 1 + 2.7 * (p - 1) ** 3 + 1.7 * (p - 1) ** 2,
};

/** Fade in at `start`, optionally fade out at `end`. */
export const presence = (t: number, start: number, end = Infinity, fade = 0.3) =>
  Math.min(ease.out(span(t, start, fade)), 1 - ease.inOut(span(t, end, fade)));

export interface Point {
  x: number;
  y: number;
}

const num = (value: number) => String(Math.round(value * 100) / 100);

/** Index of the last item matching `test`. The repository's ES2022 lib has no Array#findLastIndex. */
export function lastIndex<T>(items: readonly T[], test: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (test(items[index] as T)) {
      return index;
    }
  }
  return -1;
}

export const esc = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface TextStyle {
  size: number;
  fill?: string;
  weight?: number;
  family?: string;
  anchor?: 'start' | 'middle' | 'end';
  opacity?: number;
  spacing?: number;
}

export function text(x: number, y: number, value: string, style: TextStyle): string {
  const attributes = [
    `x="${num(x)}"`,
    `y="${num(y)}"`,
    `font-family="${style.family ?? SANS}"`,
    `font-size="${num(style.size)}"`,
    `font-weight="${style.weight ?? 400}"`,
    `fill="${style.fill ?? color.ink}"`,
  ];
  if (style.anchor && style.anchor !== 'start') {
    attributes.push(`text-anchor="${style.anchor}"`);
  }
  if (style.opacity !== undefined && style.opacity < 1) {
    attributes.push(`opacity="${num(style.opacity)}"`);
  }
  if (style.spacing) {
    attributes.push(`letter-spacing="${num(style.spacing)}"`);
  }
  return `<text ${attributes.join(' ')}>${esc(value)}</text>`;
}

export interface BoxStyle {
  radius?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export function box(x: number, y: number, width: number, height: number, style: BoxStyle) {
  const attributes = [
    `x="${num(x)}"`,
    `y="${num(y)}"`,
    `width="${num(Math.max(0, width))}"`,
    `height="${num(Math.max(0, height))}"`,
    `rx="${num(style.radius ?? 0)}"`,
    `fill="${style.fill ?? 'none'}"`,
  ];
  if (style.stroke) {
    attributes.push(`stroke="${style.stroke}"`, `stroke-width="${num(style.strokeWidth ?? 2)}"`);
  }
  if (style.opacity !== undefined && style.opacity < 1) {
    attributes.push(`opacity="${num(style.opacity)}"`);
  }
  return `<rect ${attributes.join(' ')}/>`;
}

export interface Placement {
  x?: number;
  y?: number;
  scale?: number;
  opacity?: number;
  /** Scale around this point instead of the group origin. */
  origin?: Point;
}

/** Wrap content in a transformed group. Fully transparent groups are dropped. */
export function place(content: string, placement: Placement): string {
  const opacity = placement.opacity ?? 1;
  if (opacity <= 0.001 || content === '') {
    return '';
  }
  const scale = placement.scale ?? 1;
  const transforms = [];
  if (placement.x || placement.y) {
    transforms.push(`translate(${num(placement.x ?? 0)} ${num(placement.y ?? 0)})`);
  }
  if (scale !== 1) {
    const origin = placement.origin ?? { x: 0, y: 0 };
    transforms.push(
      `translate(${num(origin.x)} ${num(origin.y)}) scale(${num(scale)}) translate(${num(-origin.x)} ${num(-origin.y)})`
    );
  }
  const attributes = [];
  if (transforms.length > 0) {
    attributes.push(`transform="${transforms.join(' ')}"`);
  }
  if (opacity < 1) {
    attributes.push(`opacity="${num(opacity)}"`);
  }
  return attributes.length === 0 ? content : `<g ${attributes.join(' ')}>${content}</g>`;
}

export function line(from: Point, to: Point, stroke: string, width = 3, opacity = 1) {
  return `<path d="M${num(from.x)} ${num(from.y)}L${num(to.x)} ${num(to.y)}" stroke="${stroke}" stroke-width="${num(width)}" stroke-linecap="round" fill="none" opacity="${num(opacity)}"/>`;
}

/** A hand-drawn style squiggle under code, revealed left to right. */
export function squiggle(x: number, y: number, width: number, progress: number, stroke: string) {
  const visible = width * clamp(progress);
  if (visible <= 0) {
    return '';
  }
  const points: string[] = [];
  for (let step = 0; step <= visible; step += 3) {
    points.push(`${num(x + step)} ${num(y + Math.sin((step / 12) * Math.PI * 2) * 3.5)}`);
  }
  return `<path d="M${points.join('L')}" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
}

// ---------------------------------------------------------------------------
// Code

export interface CodeSpan {
  line: number;
  from: number;
  to: number;
  fill: string;
}

export interface CodeLayout {
  x: number;
  y: number;
  size: number;
  lineHeight: number;
}

/** Position of a character column's left edge on a code line's baseline. */
export const column = (layout: CodeLayout, lineIndex: number, col: number): Point => ({
  x: layout.x + col * monoWidth(layout.size),
  y: layout.y + lineIndex * layout.lineHeight,
});

export interface CodeOptions extends CodeLayout {
  /** Number of characters revealed, counting each line break as one character. */
  reveal?: number;
  fill?: string;
  spans?: readonly CodeSpan[];
  opacity?: number;
}

/** Monospaced code. Each word is placed at its exact column, so spaces never collapse. */
export function code(lines: readonly string[], options: CodeOptions): string {
  const base = options.fill ?? color.paper;
  const spans = options.spans ?? [];
  let remaining = options.reveal ?? Infinity;
  const out: string[] = [];
  lines.forEach((source, lineIndex) => {
    const visible = source.slice(0, Math.max(0, Math.min(source.length, remaining)));
    remaining -= source.length + 1;
    const fills = [...visible].map((_, col) => {
      const match = lastIndex(
        spans,
        (candidate) => candidate.line === lineIndex && col >= candidate.from && col < candidate.to
      );
      return spans[match]?.fill ?? base;
    });
    let col = 0;
    while (col < visible.length) {
      if (visible[col] === ' ') {
        col += 1;
        continue;
      }
      let end = col;
      while (end < visible.length && visible[end] !== ' ' && fills[end] === fills[col]) {
        end += 1;
      }
      const at = column(options, lineIndex, col);
      out.push(
        text(at.x, at.y, visible.slice(col, end), {
          size: options.size,
          family: MONO,
          fill: fills[col] ?? base,
        })
      );
      col = end;
    }
  });
  return place(out.join(''), { opacity: options.opacity });
}

export interface Typing {
  /** Characters revealed at `t`, for `code({ reveal })`. */
  reveal(t: number): number;
  /** Time at which a character becomes visible. */
  timeOf(lineIndex: number, col: number): number;
  /** Insertion point at `t`, on the current line's midline. */
  caret(t: number, layout: CodeLayout): Point;
  start: number;
  end: number;
  /** One time per visible, non-space character, for typing sounds. */
  keystrokes: number[];
}

/** Type `lines` from `start` at `perSecond` characters, optionally skipping earlier lines. */
export function typing(
  lines: readonly string[],
  start: number,
  perSecond: number,
  fromLine = 0
): Typing {
  const offsets: number[] = [];
  let total = 0;
  for (const source of lines) {
    offsets.push(total);
    total += source.length + 1;
  }
  const skipped = offsets[fromLine] ?? 0;
  const timeOf = (lineIndex: number, col: number) =>
    start + ((offsets[lineIndex] ?? 0) + col + 1 - skipped) / perSecond;
  const reveal = (t: number) =>
    skipped + clamp(Math.floor((t - start) * perSecond), 0, total - 1 - skipped);
  const keystrokes: number[] = [];
  lines.forEach((source, lineIndex) => {
    if (lineIndex < fromLine) {
      return;
    }
    [...source].forEach((character, col) => {
      if (character !== ' ') {
        keystrokes.push(timeOf(lineIndex, col));
      }
    });
  });
  return {
    reveal,
    timeOf,
    caret(t, layout) {
      let left = reveal(t);
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const length = lines[lineIndex]?.length ?? 0;
        if (left <= length) {
          const at = column(layout, lineIndex, left);
          return { x: at.x, y: at.y - midline(layout.size) };
        }
        left -= length + 1;
      }
      const at = column(layout, lines.length - 1, lines.at(-1)?.length ?? 0);
      return { x: at.x, y: at.y - midline(layout.size) };
    },
    start,
    end: timeOf(lines.length - 1, (lines.at(-1)?.length ?? 1) - 1),
    keystrokes,
  };
}

/** A blinking insertion caret while typing is active. */
export function caretMark(t: number, typingState: Typing, layout: CodeLayout, fill = color.mint) {
  if (t < typingState.start - 0.2 || t > typingState.end + 0.6) {
    return '';
  }
  const on = t < typingState.end || Math.floor((t - typingState.end) * 3) % 2 === 0;
  const at = typingState.caret(t, layout);
  const height = layout.size * 1.05;
  return on ? box(at.x + 1, at.y - height / 2, 3, height, { fill }) : '';
}

/** Dark code panel with a file tab. Returns the panel and the layout for its first code line. */
export function codePanel(
  x: number,
  y: number,
  width: number,
  height: number,
  file: string,
  size: number
): { svg: string; layout: CodeLayout } {
  const svg = [
    box(x, y, width, height, { radius: 22, fill: color.ink }),
    text(x + 32, y + 38, file, { size: 22, weight: 600, fill: color.codeDim }),
    line({ x, y: y + 58 }, { x: x + width, y: y + 58 }, color.inkRule, 2),
  ].join('');
  return { svg, layout: { x: x + 36, y: y + 58 + size * 1.7, size, lineHeight: size * 1.53 } };
}

/** Rounded pill with centred text. */
export function pill(
  centre: Point,
  label: string,
  style: TextStyle & { background: string; padding?: number; height?: number; border?: string }
) {
  const width =
    style.family === MONO
      ? label.length * monoWidth(style.size) + (style.padding ?? 14) * 2
      : estimateSans(label, style.size, style.weight ?? 400, style.spacing ?? 0) +
        (style.padding ?? 14) * 2;
  const height = style.height ?? style.size * 1.75;
  return {
    width,
    svg:
      box(centre.x - width / 2, centre.y - height / 2, width, height, {
        radius: height / 2,
        fill: style.background,
        stroke: style.border,
      }) +
      text(centre.x, centre.y + midline(style.size), label, {
        ...style,
        anchor: 'middle',
      }),
  };
}

/** Rough Inter advance widths, good enough to size pills and badges around short labels. */
export function estimateSans(label: string, size: number, weight: number, spacing = 0) {
  const narrow = /[ilIj.,:;'!|]/;
  const wide = /[mwMW@]/;
  let units = 0;
  for (const character of label) {
    units += narrow.test(character)
      ? 0.28
      : wide.test(character)
        ? 0.86
        : character === ' '
          ? 0.28
          : /[A-Z0-9]/.test(character)
            ? 0.68
            : 0.56;
  }
  return units * size * (weight >= 600 ? 1.04 : 1) + spacing * label.length;
}

/** Point on a quadratic curve from `from` to `to` that bends towards `via`. */
export function curve(from: Point, via: Point, to: Point, progress: number): Point {
  const p = clamp(progress);
  const a = (1 - p) ** 2;
  const b = 2 * (1 - p) * p;
  const c = p ** 2;
  return { x: a * from.x + b * via.x + c * to.x, y: a * from.y + b * via.y + c * to.y };
}

/** Point on a quadratic arc from `from` to `to`, lifted by `lift` pixels at the middle. */
export function arc(from: Point, to: Point, progress: number, lift: number): Point {
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - lift };
  const p = clamp(progress);
  const a = (1 - p) ** 2;
  const b = 2 * (1 - p) * p;
  const c = p ** 2;
  return {
    x: a * from.x + b * control.x + c * to.x,
    y: a * from.y + b * control.y + c * to.y,
  };
}

// ---------------------------------------------------------------------------
// Frame chrome and captions

const wordmarkSource = readFileSync(
  new URL('../brand/layouts/wordmark.svg', import.meta.url),
  'utf8'
);
const lettering = wordmarkSource.match(/<g fill="none" stroke="currentColor"[^>]*>.*?<\/g>/s)?.[0];
const dot = wordmarkSource.match(/<circle [^>]*\/>/)?.[0];
if (!lettering || !dot) {
  throw new Error('The wordmark layout no longer contains its lettering and coral dot.');
}

/** The outlined "mimlet" lettering, with its left edge at `x` and cap top at `y`. */
export function wordmark(x: number, y: number, scale: number, ink: string = color.ink) {
  return `<g transform="translate(${num(x - 162.5 * scale)} ${num(y - 15 * scale)}) scale(${num(scale)})" color="${ink}">${lettering}${dot}</g>`;
}

export function chrome(label: string) {
  return [
    wordmark(100, 60, 0.665),
    text(1820, 100, label.toUpperCase(), {
      size: 26,
      weight: 700,
      fill: color.muted,
      anchor: 'end',
      spacing: 1.6,
    }),
    line({ x: 100, y: 138 }, { x: 1820, y: 138 }, color.rule, 2),
  ].join('');
}

export interface Beat {
  at: number;
  title: string;
  subtitle?: string;
}

/** Title and subtitle change together; each beat fades in and hands over to the next. */
export function captions(beats: readonly Beat[], t: number) {
  const index = lastIndex(beats, (beat) => beat.at <= t);
  const beat = beats[index];
  if (!beat) {
    return '';
  }
  const next = beats[index + 1];
  const fadeIn = ease.out(span(t, beat.at, 0.35));
  const fadeOut = next ? 1 - ease.inOut(span(t, next.at - 0.25, 0.25)) : 1;
  const opacity = Math.min(fadeIn, fadeOut);
  const rise = (1 - fadeIn) * 10;
  return place(
    text(960, 240 + rise, beat.title, { size: 58, weight: 700, anchor: 'middle' }) +
      (beat.subtitle
        ? text(960, 990 + rise, beat.subtitle, {
            size: 30,
            fill: color.muted,
            anchor: 'middle',
          })
        : ''),
    { opacity }
  );
}

export function frameSvg(body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="${color.paper}"/>${body}</svg>`;
}

// ---------------------------------------------------------------------------
// Keyframed values

export interface Key<T> {
  at: number;
  value: T | ((t: number) => T);
}

const resolve = <T>(key: Key<T>, t: number): T =>
  typeof key.value === 'function' ? (key.value as (t: number) => T)(t) : key.value;

/** The latest key's value at `t`. */
export function step<T>(keys: readonly Key<T>[], t: number, fallback: T): T {
  const key = keys[lastIndex(keys, (candidate) => candidate.at <= t)];
  return key ? resolve(key, t) : fallback;
}

/** Glide between point keys over `glide` seconds. Function keys can follow moving things. */
export function glidePoint(keys: readonly Key<Point>[], t: number, glide = 0.28): Point {
  const index = lastIndex(keys, (key) => key.at <= t);
  const current = keys[index];
  if (!current) {
    return keys[0] ? resolve(keys[0], t) : { x: 960, y: 540 };
  }
  const target = resolve(current, t);
  const previous = keys[index - 1];
  if (!previous) {
    return target;
  }
  const from = resolve(previous, current.at);
  const p = ease.inOut(span(t, current.at, glide));
  return { x: lerp(from.x, target.x, p), y: lerp(from.y, target.y, p) };
}

// ---------------------------------------------------------------------------
// Video modules

export interface Video {
  id: string;
  duration: number;
  /** A complete 1920 × 1080 SVG for time `t` in seconds. Must be a pure function of `t`. */
  frame(t: number): string;
  cues: readonly Cue[];
}

// ---------------------------------------------------------------------------
// Small shared marks

/** Grow `content` in from 60 % around `centre`, with a little overshoot. */
export function popIn(content: string, t: number, at: number, centre: Point) {
  const grow = ease.back(span(t, at, 0.35));
  return t < at ? '' : place(content, { scale: 0.6 + 0.4 * grow, origin: centre, opacity: grow });
}

/** A round pass or fail mark drawn as paths, so it never depends on font glyphs. */
export function verdict(centre: Point, pass: boolean, radius = 17) {
  const r = radius * 0.42;
  const glyph = pass
    ? `M${num(centre.x - r)} ${num(centre.y + 0.5)}L${num(centre.x - r * 0.25)} ${num(centre.y + r * 0.75)}L${num(centre.x + r)} ${num(centre.y - r * 0.7)}`
    : `M${num(centre.x - r * 0.8)} ${num(centre.y - r * 0.8)}L${num(centre.x + r * 0.8)} ${num(centre.y + r * 0.8)}M${num(centre.x + r * 0.8)} ${num(centre.y - r * 0.8)}L${num(centre.x - r * 0.8)} ${num(centre.y + r * 0.8)}`;
  return `<circle cx="${num(centre.x)}" cy="${num(centre.y)}" r="${num(radius)}" fill="${pass ? color.mint : color.coral}"/><path d="${glyph}" stroke="${color.ink}" stroke-width="${num(radius * 0.22)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
}
