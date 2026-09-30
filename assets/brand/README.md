# Mimlet identity

Mimlet is a small mimic: the fixture changes shape, but the offset eyes and hooked
tail keep its character recognizable. The visual system uses warm paper `#faf7ee`,
deep ink `#152725`, mint `#b6ef86` and coral `#f27b62`.

- `mark.svg` and `favicon.svg`: the original mascot and simplified small mark.
- `wordmark.svg` and `wordmark-dark.svg`: outlined lowercase lettering for light
  and dark surfaces. The wordmarks need no font download.
- `readme-banner.svg`: the repository introduction.
- `schema.svg`, `scenarios.svg`, `replay.svg`: illustrations for the three core stories.
- `social.svg` and `social.png`: the 1200 × 630 social-sharing card.

Run `pnpm brand:render` to regenerate the PNG from its editable SVG. Illustration
text uses the renderer's system sans-serif fallback; rendering on a different OS
can change those glyphs. The mascot and wordmark paths are platform-independent.

Use the unmodified hooked silhouette for small icons. Illustrations may change
the pose or body color, but retain the eyes and tail. Keep functional text in ink
on paper or paper on ink; mint and coral are accents, not low-contrast body text.
Decorative uses should have empty alternative text; the product logo should be
named “Mimlet”. All artwork is original and provided under the repository's MIT license.
