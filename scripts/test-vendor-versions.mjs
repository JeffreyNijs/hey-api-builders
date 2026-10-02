/** Reuse canonical conformance suites with integrity-pinned vendor overlays and their exact dependencies. */
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
  throw new Error(
    `Select one of ${matrix.groups.map((group) => group.adapter).join(', ')}, or omit the selection to test all`
  );

const registryEntry = (entry) =>
  entry &&
  /^\d+\.\d+\.\d+$/.test(entry.version) &&
  /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity) &&
  new URL(entry.resolved).origin === 'https://registry.npmjs.org' &&
  !entry.optionalDependencies &&
  !entry.peerDependencies &&
  Object.values(entry.dependencies ?? {}).every((range) => /^\d+\.\d+\.\d+$/.test(range));

/** Hoisted lock entries that only this vendor needs; shared packages fail closed. */
function vendorClosure(lock, name) {
  const closure = new Set();
  const pending = [name];
  while (pending.length) {
    const key = `node_modules/${pending.pop()}`;
    if (closure.has(key)) continue;
    const entry = lock.packages[key];
    if (!entry) throw new Error(`Fixture lock lacks hoisted ${key}`);
    closure.add(key);
    pending.push(...Object.keys(entry.dependencies ?? {}));
  }
  // Other packages may depend on the vendor itself, but not on its private dependencies.
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === '' || closure.has(key)) continue;
    for (const dependency of Object.keys(entry.dependencies ?? {})) {
      if (dependency !== name && closure.has(`node_modules/${dependency}`))
        throw new Error(`${key} shares ${dependency} with the vendor under test`);
    }
  }
  return closure;
}

/** The vendor and its overlay must form one closed set of exact registry releases. */
function overlayEntries(name, version) {
  const overlay = version.overlay ?? {};
  if (typeof overlay !== 'object' || Array.isArray(overlay)) throw new Error('Invalid overlay');
  const main = Object.fromEntries(Object.entries(version).filter(([key]) => key !== 'overlay'));
  const entries = new Map([[`node_modules/${name}`, main]]);
  for (const [key, entry] of Object.entries(overlay)) {
    if (!/^node_modules\/(@[a-z0-9-]+\/)?[a-z0-9.-]+$/.test(key) || entries.has(key))
      throw new Error('Overlay entries must be distinct hoisted packages');
    entries.set(key, entry);
  }
  const reached = new Set();
  for (const [key, entry] of entries) {
    if (!registryEntry(entry))
      throw new Error('Vendor overlays require pinned registry releases with exact dependencies');
    for (const [dependency, exact] of Object.entries(entry.dependencies ?? {})) {
      const target = `node_modules/${dependency}`;
      if (entries.get(target)?.version !== exact)
        throw new Error(`${key} requires ${dependency}@${exact} outside its overlay`);
      reached.add(target);
    }
  }
  for (const key of entries.keys()) {
    if (key !== `node_modules/${name}` && !reached.has(key))
      throw new Error(`Overlay entry ${key} is not required by the vendor`);
  }
  return entries;
}
for (const group of matrix.groups.filter((group) => !selected || group.adapter === selected)) {
  if (
    !/^[a-z0-9-]+$/.test(group.fixture) ||
    !/^[a-z0-9-]+$/.test(group.adapter) ||
    !['zod', 'typebox', '@sinclair/typebox', 'arktype', '@faker-js/faker'].includes(
      group.dependency
    ) ||
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
    const entries = overlayEntries(group.dependency, version);
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
      // Every unrelated lock entry stays byte-for-byte equivalent. npm ci verifies
      // the recorded tarball integrity of the vendor and each overlay entry.
      for (const key of vendorClosure(lock, group.dependency)) delete lock.packages[key];
      for (const [key, entry] of entries) lock.packages[key] = entry;
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
