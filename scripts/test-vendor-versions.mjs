/** Reuse canonical conformance suites with integrity-pinned, dependency-free vendor overlays. */
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { checkPackedFixture } from './test-optional.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const matrix = JSON.parse(await readFile(join(root, 'tests/vendor-versions.json'), 'utf8'));
assert.equal(matrix.format, 1);
const selected = process.argv[2];
if (
  process.argv.length > 3 ||
  (selected && !matrix.groups.some((group) => group.adapter === selected))
)
  throw new Error('Select zod, typebox or typebox-legacy, or omit the selection to test all');
for (const group of matrix.groups.filter((group) => !selected || group.adapter === selected)) {
  if (
    !/^[a-z0-9-]+$/.test(group.fixture) ||
    !/^[a-z0-9-]+$/.test(group.adapter) ||
    !['zod', 'typebox', '@sinclair/typebox'].includes(group.dependency) ||
    !Array.isArray(group.versions) ||
    group.versions.length > 64
  )
    throw new Error('Invalid version matrix');
  const pkg = JSON.parse(
    await readFile(join(root, 'packages', group.adapter, 'package.json'), 'utf8')
  );
  assert.equal(
    pkg.peerDependencies[group.dependency],
    group.range,
    'Peer range must match its conformance matrix'
  );
  const results = [];
  for (const version of group.versions) {
    if (
      !/^\d+\.\d+\.\d+$/.test(version.version) ||
      !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(version.integrity) ||
      new URL(version.resolved).origin !== 'https://registry.npmjs.org' ||
      version.dependencies ||
      version.optionalDependencies ||
      version.peerDependencies
    )
      throw new Error('Vendor overlays require pinned, dependency-free registry releases');
    const temporary = await mkdtemp(join(tmpdir(), 'mimlet-vendor-matrix-'));
    const fixture = join(temporary, group.fixture);
    try {
      await cp(join(root, 'tests/compatibility', group.fixture), fixture, {
        recursive: true,
        filter: (path) => !path.split(/[\\/]/).includes('node_modules'),
      });
      const manifestFile = join(fixture, 'package.json');
      const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
      const lockFile = join(fixture, 'package-lock.json');
      const lock = JSON.parse(await readFile(lockFile, 'utf8'));
      assert(manifest.dependencies[group.dependency]);
      manifest.dependencies[group.dependency] = version.version;
      lock.packages[''].dependencies[group.dependency] = version.version;
      // Every other lock entry stays byte-for-byte equivalent. npm ci verifies
      // this vendor's recorded tarball integrity before the consumer is prepared.
      lock.packages[`node_modules/${group.dependency}`] = version;
      await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
      await writeFile(lockFile, JSON.stringify(lock, null, 2));
      console.log(`Checking ${group.adapter} with ${group.dependency}@${version.version}`);
      await checkPackedFixture(fixture, { audit: true });
      results.push({ version: version.version, integrity: version.integrity, status: 'passed' });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  await mkdir(join(root, 'test-results'), { recursive: true });
  await writeFile(
    join(root, 'test-results', `vendor-versions-${group.adapter}.json`),
    JSON.stringify(
      {
        format: 1,
        runtime: process.version,
        dependency: group.dependency,
        range: group.range,
        results,
      },
      null,
      2
    )
  );
}
