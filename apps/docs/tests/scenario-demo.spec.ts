import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('the live recipe shrinks, replays and resets when its inputs change', async ({
  page,
  request,
}) => {
  const remote: string[] = [];
  await page.goto('guide/scenario-demo.html');
  page.on('request', (req) => {
    if (new URL(req.url()).origin !== new URL(page.url()).origin) {
      remote.push(req.url());
    }
  });
  await expect(page.getByRole('button', { name: 'Replay shrunk failure' })).toBeDisabled();
  await page.getByRole('button', { name: 'Find a counterexample' }).click();
  await expect(page.getByRole('article', { name: 'First failure', exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Shrunk failure', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show shrink result' }).click();
  await expect(page.getByRole('article', { name: 'Shrunk failure', exact: true })).toBeVisible();
  const totals = (await page.locator('.demo-total').allTextContents()).map((text) =>
    Number.parseInt(text)
  );
  expect(totals).toHaveLength(2);
  expect(totals[1]).toBeGreaterThan(40);
  expect(totals[1]).toBeLessThan(Number(totals[0]));
  await page.getByRole('button', { name: 'Replay shrunk failure' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Replay reproduced the same shrunk order, prices and relationships.'
  );
  await page.getByText('Inspect the replay record', { exact: true }).click();
  const record = JSON.parse(
    await page.getByRole('textbox', { name: 'Replay record' }).inputValue()
  );
  expect(record).toMatchObject({ format: 'mimlet/scenario-demo', version: 1, budgetCents: 40 });
  await page.getByLabel('Budget (cents)').fill('100');
  await expect(page.getByRole('button', { name: 'Replay shrunk failure' })).toBeDisabled();
  await expect(page.locator('.demo-order')).toHaveCount(0);
  await page.getByRole('button', { name: 'Find a counterexample' }).click();
  await page.getByRole('button', { name: 'Show shrink result' }).click();
  await page.getByRole('button', { name: 'Replay shrunk failure' }).click();
  await expect(page.getByRole('status')).toContainText('Replay reproduced');
  expect(remote).toEqual([]);
  const markdown = await (await request.get('guide/scenario-demo.md')).text();
  expect(markdown).toContain('[Open the interactive demo](/mimlet/guide/scenario-demo.html)');
  expect(markdown).not.toMatch(/<ScenarioDemo|<!-- interactive:/);
});

test('demo controls work with keyboard, mobile layout, dark theme and reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('guide/scenario-demo.html');
  await page.getByLabel('Seed', { exact: true }).fill('42');
  await page.getByLabel('Seed', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Budget (cents)')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('article', { name: 'First failure', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show shrink result' }).click();
  expect(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth
    )
  ).toBe(true);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: 'test-results/scenario-mobile.png', fullPage: true });
});
