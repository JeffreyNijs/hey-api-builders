import { test as base, expect } from '@playwright/test';

export { expect };
export const test = base.extend({
  context: async (
    { context, browser, browserName, launchOptions, contextOptions, baseURL, viewport },
    use
  ) => {
    if (browserName !== 'firefox') {
      await use(context);
      return;
    }
    // Retained traces show a loaded HTTP-200 page while Firefox's pooled driver
    // leaves goto pending. Isolate its process per case instead of retrying the
    // test, lengthening timeouts, or disabling COOP/CSP. The server stays shared.
    const isolated = await browser.browserType().launch(launchOptions);
    try {
      const fresh = await isolated.newContext({ ...contextOptions, baseURL, viewport });
      try {
        await use(fresh);
      } finally {
        await fresh.close();
      }
    } finally {
      await isolated.close();
    }
  },
});
