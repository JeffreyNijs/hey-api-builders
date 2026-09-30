/* global document, innerWidth */
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const found = [];
  errors.set(page, found);
  page.on('pageerror', (error) => found.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Generate fixtures', exact: true })).toBeEnabled();
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
const values = async (page) => JSON.parse(await page.locator('#output').textContent());
const submit = async (page, name = 'Generate fixtures') => {
  const response = page.waitForResponse((response) => response.url().endsWith('/generate'));
  await page.getByRole('button', { name, exact: true }).click();
  const result = await response;
  await expect(page.getByRole('button', { name: 'Generate fixtures', exact: true })).toBeEnabled();
  return result;
};

test('generates, replays and continues a seeded batch using only local requests', async ({
  page,
}, info) => {
  const remote = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4179/')) remote.push(request.url());
  });
  await page.getByLabel('Profile', { exact: true }).selectOption('random');
  await page.getByLabel('Count', { exact: true }).fill('4');
  expect((await submit(page)).status()).toBe(200);
  const first = await values(page);
  expect(first).toHaveLength(4);
  for (const value of first) {
    expect(Number.isInteger(value.id)).toBeTruthy();
    expect(value.id).toBeGreaterThanOrEqual(1);
    expect(['reader', 'editor', 'admin']).toContain(value.role);
    expect(value.name.length).toBeGreaterThanOrEqual(2);
  }
  expect((await submit(page, 'Replay batch')).status()).toBe(200);
  expect(await values(page)).toEqual(first);
  expect((await submit(page, 'Next batch')).status()).toBe(200);
  expect(await values(page)).not.toEqual(first);
  await page.getByText('Generation details & replay identity', { exact: true }).click();
  const inspection = JSON.parse(await page.locator('#inspection').textContent());
  expect(inspection.network).toBe(false);
  expect(inspection.validation).toBe('ajv');
  expect(inspection.identity.provider).toContain('json-schema-faker');
  expect(remote).toEqual([]);
  await page.screenshot({ path: info.outputPath('desktop.png'), fullPage: true });
});

test('saves fixture and replay JSON, then imports the same batch', async ({ page }) => {
  await page.getByLabel('Profile', { exact: true }).selectOption('random');
  await submit(page);
  const original = await values(page);
  const fixtureDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save fixtures', exact: true }).click();
  const fixture = await fixtureDownload;
  expect(fixture.suggestedFilename()).toBe('fixtures.json');
  expect(JSON.parse(await readFile(await fixture.path(), 'utf8'))).toEqual(original);
  const replayDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save replay', exact: true }).click();
  const replay = await replayDownload;
  const saved = JSON.parse(await readFile(await replay.path(), 'utf8'));
  expect(saved.replay.version).toBeDefined();
  expect(saved.seed).toBeUndefined();
  await submit(page, 'Next batch');
  expect(await values(page)).not.toEqual(original);
  const response = page.waitForResponse((response) => response.url().endsWith('/generate'));
  await page.getByLabel('Load a saved replay', { exact: false }).setInputFiles(await replay.path());
  expect((await response).status()).toBe(200);
  await expect(page.getByRole('status')).toContainText('Loaded and replayed');
  expect(await values(page)).toEqual(original);
});

test('uses offline references, variants and all configured dialects', async ({ page }) => {
  await page.getByLabel('Example', { exact: true }).selectOption('reference');
  await submit(page);
  for (const value of await values(page))
    expect(['BE', 'NL', 'FR']).toContain(value.address.country);
  await page.getByLabel('Example', { exact: true }).selectOption('union');
  await submit(page);
  for (const value of await values(page)) expect(['created', 'deleted']).toContain(value.kind);
  for (const dialect of ['draft-07', 'draft-2019-09', 'draft-2020-12']) {
    await page
      .getByLabel('Schema document', { exact: true })
      .fill('{"type":"integer","minimum":3,"maximum":3}');
    await page.getByLabel('Dialect', { exact: true }).selectOption(dialect);
    await submit(page);
    expect(await values(page)).toEqual([3, 3, 3]);
  }
});

test('shows actionable errors without executing schema text and supports keyboard generation', async ({
  page,
}) => {
  await page.getByLabel('Schema document', { exact: true }).fill('{broken');
  await page.getByRole('button', { name: 'Generate fixtures', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('must be valid JSON');
  await page.getByLabel('Schema document', { exact: true }).fill('false');
  expect((await submit(page)).status()).toBe(422);
  await expect(page.getByRole('status')).toContainText('does not prove');
  const text =
    '<img src="https://private.invalid/leak" onerror="globalThis.injected=1"><script>globalThis.injected=1</script>';
  await page.getByLabel('Schema document', { exact: true }).fill(JSON.stringify({ const: text }));
  const response = page.waitForResponse((response) => response.url().endsWith('/generate'));
  await page.getByLabel('Schema document', { exact: true }).press('Control+Enter');
  expect((await response).status()).toBe(200);
  await expect(page.locator('#output')).toContainText(text);
  expect(await page.locator('#output img, #output script').count()).toBe(0);
  expect(await page.evaluate(() => globalThis.injected)).toBeUndefined();
});

test('cancels expensive native work and remains usable', async ({ page }) => {
  const schema = { type: 'string', pattern: '^(a+)+$', examples: ['a'.repeat(35) + '!'] };
  await page.getByLabel('Schema document', { exact: true }).fill(JSON.stringify(schema));
  await page.getByLabel('Profile', { exact: true }).selectOption('examples');
  await page.getByRole('button', { name: 'Generate fixtures', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Generation cancelled');
  await page.getByLabel('Schema document', { exact: true }).fill('{"const":42}');
  expect((await submit(page)).status()).toBe(200);
  expect(await values(page)).toEqual([42, 42, 42]);
});

test('rejects malformed replay files and handles empty batches honestly', async ({ page }) => {
  await page.getByLabel('Load a saved replay', { exact: false }).setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{invalid'),
  });
  await expect(page.getByRole('status')).toContainText('Could not load the replay');
  await page.getByLabel('Count', { exact: true }).fill('0');
  await submit(page);
  expect(await values(page)).toEqual([]);
  await expect(page.locator('#result-count')).toHaveText('0 CHECKED');
});

test('remains keyboard-accessible and fits narrow and dark viewports', async ({ page }, info) => {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).toBeTruthy();
  }
  await page.getByLabel('Profile', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Dialect', { exact: true })).toBeFocused();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 390, height: 844 });
  await submit(page);
  await page.screenshot({ path: info.outputPath('mobile-dark.png'), fullPage: true });
  const labels = ['Profile', 'Dialect', 'Seed', 'Count', 'Schema document'];
  for (const label of labels) await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  expect(await page.locator('html').getAttribute('lang')).toBe('en');
  expect(await page.locator('#status').getAttribute('aria-live')).toBe('polite');
});
