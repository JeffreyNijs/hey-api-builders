import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const node = process.execPath;
const temporaryRoot = await mkdtemp(join(tmpdir(), 'hey-api-builders-package-'));

try {
  const packOutput = execFileSync(
    npm,
    ['pack', '--json', '--ignore-scripts', '--pack-destination', temporaryRoot],
    {
      cwd: packageRoot,
      encoding: 'utf8',
    }
  );
  const [packResult] = JSON.parse(packOutput);
  assert(packResult, 'npm pack did not describe an artifact');

  const expectedFiles = [
    'CHANGELOG.md',
    'LICENSE',
    'README.md',
    'dist/index.d.ts',
    'dist/index.js',
    'dist/index.js.map',
    'package.json',
  ];
  assert.deepEqual(
    packResult.files.map(({ path }) => path).sort(),
    expectedFiles,
    'the npm package contains an unexpected file set'
  );

  const consumerDirectory = join(temporaryRoot, 'consumer');
  await mkdir(consumerDirectory);
  await writeFile(
    join(consumerDirectory, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`,
    'utf8'
  );

  const tarball = join(temporaryRoot, packResult.filename);
  execFileSync(
    npm,
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      '--save-exact',
      tarball,
      '@faker-js/faker@10.5.0',
      '@hey-api/openapi-ts@0.99.0',
      'typescript@6.0.3',
    ],
    {
      cwd: consumerDirectory,
      stdio: 'inherit',
    }
  );

  const runtimeAcceptance = join(consumerDirectory, 'acceptance.mjs');
  await writeFile(
    runtimeAcceptance,
    `import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import builders, { buildersPlugin, defaultConfig, defineConfig } from 'hey-api-builders';

assert.equal(builders, defineConfig);
assert.equal(buildersPlugin, defineConfig);
assert.equal(defaultConfig.name, 'hey-api-builders');
assert.equal(builders({ responses: false }).name, 'hey-api-builders');

const require = createRequire(import.meta.url);
assert.throws(
  () => require('hey-api-builders'),
  (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
);
`,
    'utf8'
  );
  execFileSync(node, [runtimeAcceptance], {
    cwd: consumerDirectory,
    stdio: 'inherit',
  });

  console.log('Packed ESM consumer validation passed.');
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
