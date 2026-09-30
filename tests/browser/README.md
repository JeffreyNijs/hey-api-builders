# Browser acceptance

`node scripts/test-browser.mjs --install` installs the pinned Playwright browser
engines and tests actual packed core, JSON Schema, and playground packages in a
fresh consumer. Without `--install`, it uses the installed engines. `--list`
checks discovery without launching a browser.

The suite runs Chromium, Firefox, and WebKit without application bundler aliases
or Node polyfills in browser code. It exercises generation, before/after replay,
local file export/import, cancellation, invalid schema handling, text-injection
resistance, keyboard navigation, narrow/dark layouts, and the core's native ESM,
fixture graph cloning, sessions, transformed validation, and scenarios.

Only loopback servers owned by the test are used. The test-only core server
serves a fixed whitelist of installed core modules; it is not shipped with the
playground. Browser reports, traces, and desktop/mobile screenshots are copied
to `test-results/browser` and retained as CI artifacts. They contain the suite's
synthetic examples only, not user schemas or production data.

A passing Node HTTP suite does not replace these tests. Browser tests are a
separate required release gate; no automatic retries hide a failing first run.
