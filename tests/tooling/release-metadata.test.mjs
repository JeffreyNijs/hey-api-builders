import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { validateReleasePackageMetadata } from '../../scripts/release-manifest.mjs';
const core = '@jeffreynijs/test-builders';
const version = '0.1.0-alpha.0';
const manifest = {
  packages: [
    { name: core, version },
    { name: 'hey-api-builders', version: '3.0.0-alpha.0' },
  ],
};
const metadata = () => [
  { name: core, version, private: false },
  {
    name: 'hey-api-builders',
    version: '3.0.0-alpha.0',
    private: false,
    dependencies: { [core]: version },
  },
];
test('accepts a complete, exact packed dependency graph', () => {
  const value = metadata();
  assert.equal(validateReleasePackageMetadata(manifest, value), value);
});
test('rejects tampered, incomplete or mismatched package sets before publication', () => {
  for (const value of [null, [], metadata().slice(0, 1), [metadata()[0], metadata()[0]]])
    assert.throws(() => validateReleasePackageMetadata(manifest, value));
  for (const field of ['name', 'version', 'private']) {
    const value = metadata();
    value[1][field] = field === 'private' ? true : 'wrong';
    assert.throws(() => validateReleasePackageMetadata(manifest, value));
  }
  assert.throws(() => validateReleasePackageMetadata({}, metadata()));
});
test('checks internal dependencies in every dependency group including missing packages', () => {
  for (const group of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const dependencies of [
      [],
      'invalid',
      { [core]: '^' + version },
      { '@jeffreynijs/test-builders-absent': version },
      { external: 1 },
    ]) {
      const value = metadata();
      value[1][group] = dependencies;
      assert.throws(() => validateReleasePackageMetadata(manifest, value));
    }
  }
});
test('publication uses the exact canonical tested guard, not an untested handwritten copy', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/npm-publish.yml', import.meta.url),
    'utf8'
  );
  const block = workflow.match(
    / {10}\/\/ BEGIN CANONICAL METADATA GUARD\n([\s\S]*?) {10}\/\/ END CANONICAL METADATA GUARD/
  )[1];
  const source = block
    .trimEnd()
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
  assert.equal(source, validateReleasePackageMetadata.toString());
  assert(
    workflow.indexOf('validateReleasePackageMetadata(m, metadataSet)') <
      workflow.indexOf("['publish'")
  );
  assert.match(workflow, /needs: \[prepare, portable\]/);
  assert.match(workflow, /git merge-base --is-ancestor HEAD refs\/remotes\/origin\/main/);
  assert.match(workflow, /pnpm audit:production/);
});
