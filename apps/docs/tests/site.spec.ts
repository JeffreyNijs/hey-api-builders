import { readFile, readdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createMarkdownRenderer } from 'vitepress';
import { fileURLToPath } from 'node:url';

test('all rendered fences and Markdown recipes match their canonical source verbatim', async ({
  page,
  request,
}) => {
  const root = new URL('../../../', import.meta.url);
  const markdown = await createMarkdownRenderer(fileURLToPath(root));
  const sources: [string, string][] = [
    ...(await readdir(new URL('docs/', root)))
      .filter((name) => name.endsWith('.md'))
      .map((name): [string, string] => [`docs/${name}`, `guide/${name}`]),
    ...(await readdir(new URL('packages/', root))).map((name): [string, string] => [
      `packages/${name}/README.md`,
      `packages/${name}.md`,
    ]),
  ];
  const discrepancies: string[] = [];
  let checked = 0;
  for (const [file, route] of sources) {
    const original = await readFile(new URL(file, root), 'utf8');
    const expected: string[] = [];
    for (const token of markdown.parse(original, {}) as { type: string; content: string }[]) {
      if (token.type === 'fence') {
        expected.push(token.content.trimEnd());
      }
      const recipe =
        token.type === 'html_block' && /^<!-- recipe:([a-z-]+) -->\s*$/.exec(token.content);
      if (recipe) {
        expected.push(
          (await readFile(new URL(`examples/recipes/${recipe[1]}.ts`, root), 'utf8')).trimEnd()
        );
      }
    }
    await page.goto(route.replace(/\.md$/, '.html'));
    const rendered = (await page.locator('.vp-doc pre code').allTextContents()).map((text) =>
      text.trimEnd()
    );
    const clean = markdown.parse(await (await request.get(route)).text(), {}) as {
      type: string;
      content: string;
    }[];
    const downloaded = clean
      .filter((token) => token.type === 'fence')
      .map((token) => token.content.trimEnd());
    for (const [surface, blocks] of [
      ['HTML', rendered],
      ['Markdown', downloaded],
    ] as const) {
      if (blocks.length !== expected.length) {
        discrepancies.push(`${route}: ${surface} fence count`);
      }
      expected.forEach((code, index) => {
        if (blocks[index] !== code) {
          discrepancies.push(`${route}: ${surface} fence ${index + 1}`);
        }
      });
    }
    checked += expected.length;
  }
  await page.goto('./');
  const hero = (await readFile(new URL('examples/recipes/hero.ts', root), 'utf8')).trimEnd();
  expect((await page.locator('.hero-code pre code').textContent())?.trimEnd()).toBe(hero);
  expect(checked).toBeGreaterThan(50);
  expect(discrepancies).toEqual([]);
  console.log(
    `Verified ${checked} canonical code fences across ${sources.length} pages, plus the homepage recipe.`
  );
});

test('every documentation route and its Markdown alternate resolve below /mimlet/', async ({
  request,
}) => {
  const manifest = JSON.parse(
    await readFile(new URL('../.generated/site-manifest.json', import.meta.url), 'utf8')
  ) as { pages: string[]; packages: string[] };
  const packageRoot = new URL('../../../packages/', import.meta.url);
  const packageDirectories = (await readdir(packageRoot, { withFileTypes: true })).filter((entry) =>
    entry.isDirectory()
  );
  const expectedPackages = await Promise.all(
    packageDirectories.map(async (entry) => {
      const source = JSON.parse(
        await readFile(new URL(`${entry.name}/package.json`, packageRoot), 'utf8')
      ) as { name: string };
      return source.name;
    })
  );
  expect([...manifest.packages].sort()).toEqual(expectedPackages.sort());
  for (const path of manifest.pages) {
    const response = await request.get(path.replace(/\.md$/, '.html'));
    expect(response.status(), path).toBe(200);
    const html = await response.text();
    expect(html).toContain(`rel="alternate" type="text/markdown" href="/mimlet/${path}"`);
    const markdown = await request.get(path);
    expect(markdown.status(), path).toBe(200);
    const source = await markdown.text();
    expect(source).toMatch(/^#/);
    expect(source).not.toMatch(/<!-- recipe:|<MimletHome|<!DOCTYPE/i);
    for (const match of source.matchAll(/\]\((\/mimlet\/[^)#]+)(?:#[^)]*)?\)/g)) {
      expect((await request.get(match[1]!)).status(), `${path}: ${match[1]}`).toBe(200);
    }
  }
  const index = await request.get('llms.txt');
  expect(index.status()).toBe(200);
  const text = await index.text();
  expect(text).toContain('new npm names are not published');
  for (const name of manifest.packages) {
    expect(text).toContain(`[${name}]`);
  }
  expect(await (await request.get('guide/agents.md')).text()).toContain(
    "from '@mimlet/fast-check'"
  );
});

test('desktop, mobile and dark layouts remain usable and accessible', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [name, width, height, colorScheme] of [
    ['desktop', 1440, 1000, 'light'],
    ['mobile', 390, 844, 'light'],
    ['dark', 1440, 1000, 'dark'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Test data, with character.' })).toBeVisible();
    await expect(page.getByText('New npm packages are not published yet.')).toBeVisible();
    expect(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth
      )
    ).toBe(true);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations,
      JSON.stringify(
        result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((n) => n.target) }))
      )
    ).toEqual([]);
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('navigation, local search and clean Markdown work with keyboard input', async ({ page }) => {
  await page.goto('./');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.getByRole('link', { name: 'Meet Mimlet' }).click();
  await expect(page.getByRole('heading', { name: /^Meet Mimlet/, level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /Read as Markdown/ })).toHaveAttribute(
    'href',
    '/mimlet/guide/getting-started.md'
  );
  await page
    .getByRole('button', { name: /Search/ })
    .first()
    .click();
  await page.getByRole('searchbox').fill('replay');
  await expect(page.getByRole('dialog')).toBeVisible();
  const firstResult = page.getByRole('dialog').getByRole('option').first();
  await expect(firstResult).toBeVisible();
  const target = await firstResult.getAttribute('href');
  const searchAccess = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    searchAccess.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    }))
  ).toEqual([]);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page).toHaveURL(new URL(target!, page.url()).href);
  await page.goto('guide/getting-started.html');
  const docAccess = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    docAccess.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))
  ).toEqual([]);
});

test('brand exports and static discovery metadata are present', async ({ page, request }) => {
  await page.goto('./');
  await expect(page.locator('link[rel="describedby"]')).toHaveAttribute('href', '/mimlet/llms.txt');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://jeffreynijs.github.io/mimlet/brand/social.png'
  );
  for (const name of [
    'mark.svg',
    'wordmark.svg',
    'wordmark-dark.svg',
    'favicon.svg',
    'schema.svg',
    'scenarios.svg',
    'replay.svg',
    'readme-banner.svg',
    'social.png',
  ]) {
    expect((await request.get(`brand/${name}`)).status(), name).toBe(200);
  }
  const sitemap = await (await request.get('sitemap.xml')).text();
  expect(sitemap).toContain('https://jeffreynijs.github.io/mimlet/guide/getting-started.html');
  expect(sitemap).not.toContain('/mimlet/mimlet/');
  expect((await request.get('../package.json')).status()).toBe(404);
  expect((await request.get('/mimlet/%2e%2e%2fpackage.json')).status()).toBe(404);
  expect((await request.post('index.html')).status()).toBe(405);
  expect((await request.head('brand/mark.svg')).status()).toBe(200);
});
