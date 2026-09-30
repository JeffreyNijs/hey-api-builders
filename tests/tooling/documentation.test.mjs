import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  markdownFileLinks,
  checkFileLinks,
  checkPackageIndex,
  checkDocumentation,
} from '../../scripts/check-documentation.ts';

async function fixture(markdown, run) {
  const root = await mkdtemp(join(tmpdir(), 'toolkit-docs-'));
  try {
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'docs/guide.md'), markdown);
    await writeFile(join(root, 'README.md'), '# Toolkit');
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
it('checks the actual maintained documentation and every workspace package', async () => {
  const result = await checkDocumentation();
  assert.ok(result.packages >= 17);
  assert.ok(result.documents > result.packages);
  assert.ok(result.links > result.packages);
});
it('extracts prose links without treating fenced examples as navigation', () => {
  const source =
    '[one](README.md)\n```ts\nconst sample = "[ignored](missing.md)";\n```\n![two](<image.png> "title")\n~~~\n[ignored](another.md)\n~~~';
  assert.deepEqual(markdownFileLinks(source), ['README.md', 'image.png']);
});
it('checks relative files but never makes external network requests or claims to validate anchors', () =>
  fixture(
    '[root](../README.md#section) [web](https://example.invalid/x) [mail](mailto:maintainer@example.invalid) [anchor](#local) [cdn](//example.invalid/x)',
    async (root) => {
      assert.equal(await checkFileLinks(root, ['docs/guide.md']), 1);
    }
  ));
it('reports broken links, traversal, malformed encodings and executable schemes', async () => {
  for (const [source, pattern] of [
    ['[bad](missing.md)', /missing local link/],
    ['[bad](../../private.md)', /escapes the repository/],
    ['[bad](%2e%2e/%2e%2e/private.md)', /escapes the repository/],
    ['[bad](%GG.md)', /malformed encoded/],
    ['[bad](javascript:alert)', /unsupported link scheme/],
  ])
    await fixture(source, (root) =>
      assert.rejects(checkFileLinks(root, ['docs/guide.md']), pattern)
    );
});
it('does not let a new public package disappear from the root package index', () => {
  checkPackageIndex('[core](packages/core/README.md)', ['core']);
  assert.throws(
    () => checkPackageIndex('[core](packages/core/README.md)', ['core', 'new-adapter']),
    /missing: new-adapter/
  );
});
