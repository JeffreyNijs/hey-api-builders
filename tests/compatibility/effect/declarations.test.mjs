import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { URL } from 'node:url';

// This inspects the installed tarball, never a workspace source alias.
test('Effect public declarations do not leak native transitive or pnpm paths', async () => {
  const entry = import.meta.resolve('@mimlet/effect');
  const declaration = await readFile(new URL('./index.d.ts', entry), 'utf8');
  assert.match(declaration, /standard: StandardSchemaV1<I, A>/);
  assert.doesNotMatch(declaration, /@standard-schema\/spec|node_modules|\.pnpm/);
});
