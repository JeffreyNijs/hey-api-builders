/** Build and test real tarballs in a consumer outside the repository dependency tree. */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(join(tmpdir(), 'test-builders-typebox-'));
const npmCandidates = [
  join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
];
const npmCli = npmCandidates.find(existsSync);
if (!npmCli) throw new Error('Cannot locate npm alongside the active Node installation');
const compiler = join(root, 'node_modules/typescript/bin/tsc');
const artifacts = join(temporary, 'artifacts');
const fixture = join(root, 'tests/compatibility/typebox');
const npm = (args, cwd = temporary, capture = false) =>
  execFileSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    timeout: 120_000,
  });
const pack = async (directory) => {
  const result = JSON.parse(
    npm(['pack', '--json', '--ignore-scripts', '--pack-destination', artifacts], directory, true)
  );
  return join(artifacts, result[0].filename);
};
try {
  await mkdir(artifacts);
  await cp(join(fixture, 'package.json'), join(temporary, 'package.json'));
  if (!existsSync(join(fixture, 'package-lock.json'))) {
    throw new Error('The TypeBox compatibility lockfile must be generated and committed first');
  }
  await cp(join(fixture, 'package-lock.json'), join(temporary, 'package-lock.json'));
  npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  const core = await pack(join(root, 'packages/test-builders'));
  npm([
    'install',
    '--no-save',
    '--package-lock=false',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    core,
  ]);
  const tarballs = [];
  for (const name of ['test-builders-typebox', 'test-builders-typebox-legacy']) {
    const directory = join(temporary, 'adapters', name);
    await cp(join(root, 'packages', name), directory, {
      recursive: true,
      filter: (source) =>
        !source.split(/[\\/]/).some((part) => part === 'dist' || part === 'node_modules'),
    });
    execFileSync(process.execPath, [compiler, '-p', join(directory, 'tsconfig.json')], {
      cwd: temporary,
      stdio: 'inherit',
      timeout: 120_000,
    });
    tarballs.push(await pack(directory));
  }
  npm([
    'install',
    '--no-save',
    '--package-lock=false',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    core,
    ...tarballs,
  ]);
  await cp(join(fixture, 'types.mts'), join(temporary, 'types.mts'));
  await cp(join(fixture, 'runtime.test.mjs'), join(temporary, 'runtime.test.mjs'));
  await writeFile(
    join(temporary, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        lib: ['ES2022'],
        types: [],
        strict: true,
        exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true,
        verbatimModuleSyntax: true,
        noEmit: true,
      },
      include: ['types.mts'],
    })
  );
  execFileSync(process.execPath, [compiler, '-p', join(temporary, 'tsconfig.json')], {
    cwd: temporary,
    stdio: 'inherit',
    timeout: 120_000,
  });
  execFileSync(process.execPath, ['--test', 'runtime.test.mjs'], {
    cwd: temporary,
    stdio: 'inherit',
    timeout: 120_000,
  });
  const dependencies = JSON.parse(
    await readFile(join(temporary, 'package.json'), 'utf8')
  ).dependencies;
  console.log('Packed TypeBox runtime and declaration checks passed:', dependencies);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
