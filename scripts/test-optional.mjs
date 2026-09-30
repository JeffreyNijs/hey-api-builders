/** Build optional packages and test their actual tarballs outside the repository. */
import { execFileSync } from 'node:child_process';
import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPackedConsumer } from './packed-consumer.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
if (!/^[a-z0-9-]+$/.test(name ?? '')) throw new Error('An optional fixture name is required');
const fixture = join(root, 'tests/compatibility', name);
const manifest = JSON.parse(await readFile(join(fixture, 'package.json'), 'utf8'));
const packages = manifest.toolkitPackages;
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
await withPackedConsumer(fixture, async ({ temporary, compiler, run }) => {
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
});
