import assert from 'node:assert/strict';
import { it } from 'node:test';
import { validateReleaseManifest } from '../../scripts/release-manifest.mjs';
const fixture = () => ({
  format: 1,
  commit: 'a'.repeat(40),
  coreVersion: '0.1.0-alpha.0',
  tag: 'toolkit-v0.1.0-alpha.0',
  distTag: 'next',
  packages: [
    {
      name: '@mimlet/core',
      version: '0.1.0-alpha.0',
      filename: 'mimlet-core-0.1.0-alpha.0.tgz',
      sha256: 'b'.repeat(64),
      integrity: 'sha512-YQ==',
    },
    {
      name: 'hey-api-builders',
      version: '3.0.0-alpha.0',
      filename: 'hey-api-builders-3.0.0-alpha.0.tgz',
      sha256: 'c'.repeat(64),
      integrity: 'sha512-Yg==',
    },
  ],
});
it('accepts a coordinated prerelease but never silently changes the distribution tag', () => {
  const value = fixture();
  assert.equal(validateReleaseManifest(value, value.tag), value);
  assert.throws(() => validateReleaseManifest(value, 'v2.0.0'), /tag/);
});
it('rejects unsafe metadata, artifact paths, duplicates and mismatched release versions', () => {
  const changes = [
    (value) => {
      value.format = 2;
    },
    (value) => {
      value.commit = 'main';
    },
    (value) => {
      value.coreVersion = '01.0.0';
    },
    (value) => {
      value.distTag = 'latest';
    },
    (value) => {
      value.tag = 'v0.1.0';
    },
    (value) => {
      value.packages = [];
    },
    (value) => {
      value.packages[0].filename = '../secrets.tgz';
    },
    (value) => {
      value.packages[0].name = '@other/private';
    },
    (value) => {
      value.packages[0].name = 'mimlet';
      value.packages[0].filename = 'mimlet-0.1.0-alpha.0.tgz';
    },
    (value) => {
      value.packages[0].sha256 = 'x';
    },
    (value) => {
      value.packages[0].integrity = 'hash';
    },
    (value) => {
      value.packages.push({ ...value.packages[0] });
    },
    (value) => {
      value.packages[0].version = '0.2.0-alpha.0';
      value.packages[0].filename = 'mimlet-core-0.2.0-alpha.0.tgz';
    },
    (value) => {
      value.packages[1].version = '3.0.0';
      value.packages[1].filename = 'hey-api-builders-3.0.0.tgz';
    },
    (value) => {
      value.packages.reverse();
    },
  ];
  for (const change of changes) {
    const value = fixture();
    change(value);
    assert.throws(() => validateReleaseManifest(value), /Release:/);
  }
});
it('accepts a stable train only on the latest distribution channel', () => {
  const value = fixture();
  value.coreVersion = '0.1.0';
  value.tag = 'toolkit-v0.1.0';
  value.distTag = 'latest';
  for (const pkg of value.packages) {
    pkg.version = pkg.version.replace('-alpha.0', '');
    pkg.filename = pkg.filename.replace('-alpha.0', '');
  }
  assert.equal(validateReleaseManifest(value), value);
});
