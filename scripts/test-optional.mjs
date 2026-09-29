/** Build optional packages and test their actual tarballs outside the repository. */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
if (!/^[a-z0-9-]+$/.test(name ?? '')) throw new Error('An optional fixture name is required');
const fixture = join(root, 'tests/compatibility', name);
const manifest = JSON.parse(await readFile(join(fixture, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(join(fixture, 'package-lock.json'), 'utf8'));
const packages = manifest.toolkitPackages;
if (!Array.isArray(packages) || packages.some((name) => !/^test-builders-[a-z0-9-]+$/.test(name))) {
  throw new Error('The fixture must declare its tested toolkit packages');
}
const compilerLibs = manifest.compilerLibs ?? ['ES2022'];
if (!Array.isArray(compilerLibs) || compilerLibs.some((lib) => !['ES2022', 'DOM'].includes(lib))) {
  throw new Error('Unsupported fixture compiler library');
}
const compilerTypes = manifest.compilerTypes ?? [];
if (!Array.isArray(compilerTypes) || compilerTypes.some((name) => name !== 'node')) {
  throw new Error('Unsupported fixture compiler types');
}
const coveragePackages = manifest.coveragePackages ?? packages;
if (
  !Array.isArray(coveragePackages) ||
  coveragePackages.length === 0 ||
  coveragePackages.some((name) => !packages.includes(name))
) {
  throw new Error('Coverage packages must be explicitly tested toolkit packages');
}
const compiler = join(root, 'node_modules/typescript/bin/tsc');
const npmCli = [
  join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
].find(existsSync);
if (!npmCli) throw new Error('Cannot locate npm for the active Node installation');
const temporary = await mkdtemp(join(tmpdir(), `test-builders-${name}-`));
const artifacts = join(temporary, 'artifacts');
const offline = process.env.TOOLKIT_OFFLINE_MODULES;
const run = (file, args, cwd = temporary, capture = false) =>
  execFileSync(process.execPath, [file, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    timeout: 120_000,
  });
const npm = (args, cwd = temporary, capture = false) =>
  run(npmCli, [...args, ...(offline ? ['--offline'] : [])], cwd, capture);
const pack = async (directory) => {
  const result = JSON.parse(
    npm(
      ['pack', directory, '--json', '--ignore-scripts', '--pack-destination', artifacts],
      temporary,
      true
    )
  );
  return join(artifacts, result[0].filename);
};
const offlineTarballs = [];
const install = (files) =>
  npm([
    'install',
    '--no-save',
    '--package-lock=false',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    ...offlineTarballs,
    ...files,
  ]);
try {
  await mkdir(artifacts);
  await cp(join(fixture, 'package.json'), join(temporary, 'package.json'));
  await cp(join(fixture, 'package-lock.json'), join(temporary, 'package-lock.json'));
  if (offline) {
    // Reuse an explicitly supplied installed cache for local work, never substitute mocks.
    // CI takes the npm ci path and checks the lockfile integrity against the registry.
    for (const [path, entry] of Object.entries(lock.packages)) {
      if (path === '') continue;
      if (!path.startsWith('node_modules/') || path.includes('..') || !entry.version)
        throw new Error('Unsupported dependency-cache entry');
      const from = join(resolve(offline), path.slice('node_modules/'.length));
      const installed = JSON.parse(await readFile(join(from, 'package.json'), 'utf8'));
      if (installed.version !== entry.version)
        throw new Error(`Cached dependency version differs: ${path}`);
      await cp(from, join(temporary, path), { recursive: true, dereference: true });
      // Pack the copy: pnpm caches use hardlinks that npm does not reliably reinstall.
      offlineTarballs.push(await pack(join(temporary, path)));
    }
  } else {
    npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  }
  run(compiler, ['-p', join(root, 'packages/test-builders/tsconfig.json')], root);
  const core = await pack(join(root, 'packages/test-builders'));
  install([core]);
  const tarballs = [];
  for (const name of packages) {
    const directory = join(temporary, 'packages', name);
    await cp(join(root, 'packages', name), directory, {
      recursive: true,
      filter: (path) =>
        !path.split(/[\\/]/).some((part) => part === 'dist' || part === 'node_modules'),
    });
    run(compiler, ['-p', join(directory, 'tsconfig.json')]);
    tarballs.push(await pack(directory));
    install([core, ...tarballs]);
  }
  await cp(join(fixture, 'types.mts'), join(temporary, 'types.mts'));
  const testFiles = (await readdir(fixture))
    .filter((name) => /^[a-zA-Z0-9_.-]+\.test\.mjs$/.test(name))
    .sort();
  if (testFiles.length === 0) throw new Error('The fixture must include runtime tests');
  for (const file of testFiles) await cp(join(fixture, file), join(temporary, file));
  await writeFile(
    join(temporary, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        lib: compilerLibs,
        types: compilerTypes,
        strict: true,
        exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true,
        verbatimModuleSyntax: true,
        noEmit: true,
      },
      include: ['types.mts'],
    })
  );
  run(compiler, ['-p', join(temporary, 'tsconfig.json')]);
  execFileSync(
    process.execPath,
    [
      '--experimental-test-coverage',
      ...coveragePackages.map(
        (name) => `--test-coverage-include=**/node_modules/@jeffreynijs/${name}/dist/*.js`
      ),
      '--test-coverage-lines=90',
      '--test-coverage-branches=85',
      '--test-coverage-functions=90',
      '--test',
      ...testFiles,
    ],
    { cwd: temporary, stdio: 'inherit', timeout: 120_000 }
  );
  console.log('Packed optional compatibility passed:', name, manifest.dependencies);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
