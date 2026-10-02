# Mimlet identity

Mimlet is a mint folded-corner document creature with offset eyes, a coral cheek,
a small smile and little feet. The visual system uses warm paper `#faf7ee`,
deep ink `#152725`, mint `#b6ef86` and coral `#f27b62`.

- `mark.svg` and `mark-dark.svg`: the approved mascot, sized for the existing
  logo layout; the dark variant adds a warm-paper keyline
- `favicon.svg`: the simplified square small-size drawing, with a readable fold,
  eyes and smile at 16–24 pixels
- `wordmark.svg` and `wordmark-dark.svg`: original outlined lowercase lettering
  for light and dark surfaces; the dark mascot uses the same warm-paper keyline
  and no font download is needed
- `readme-banner.svg`: the repository introduction
- `schema.svg`, `scenarios.svg`, `replay.svg`: illustrations for the three core stories
- `social.svg` and `social.png`: the 1200 × 630 social-sharing card

## Editing and rendering

Edit the hand-authored master in `scripts/brand/mascot.svg` and the intentionally
simplified small icon in `scripts/brand/icon.svg`. Layouts live in
`scripts/brand/layouts/`; each `<!-- mascot -->` slot receives the same geometry
through `scripts/render-brand.ts`. Do not edit the generated assets individually.
The published SVGs are standalone vectors, with no embedded raster images,
external dependencies, scripts or animation. They work without JavaScript and
remain static for reduced-motion users.

Run `pnpm brand:render` to regenerate all SVGs and the social PNG, or
`pnpm brand:render --check` to verify they are current. Run `pnpm test:tooling`
for geometry, asset coverage, accessibility and raster checks. The existing pinned
Resvg development dependency renders the PNG without system fonts: the social
layout preserves its lettering as vector outlines, so output is reproducible.
Other illustration text retains the original system sans-serif font stack and
may vary between operating systems. Wordmark lettering is unchanged vector art.

Retain the folded corner, offset eyes, smile and feet when using the mascot. Use
the simplified favicon for tiny icons. Keep functional text in ink on paper or
paper on ink; mint and coral are accents, not low-contrast body text.
Decorative uses should have empty alternative text; the product logo should be
named “Mimlet”. Mascot artwork is original and provided under the repository's
MIT license.
