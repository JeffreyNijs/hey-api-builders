import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(root, 'packages/core/test');
const files = (await readdir(directory))
  .filter((file) => file.endsWith('.test.mjs'))
  .sort()
  .map((file) => join(directory, file));
execFileSync(
  process.execPath,
  [
    '--experimental-test-coverage',
    '--test-coverage-include=**/packages/core/dist/*.js',
    '--test-coverage-lines=95',
    '--test-coverage-branches=90',
    '--test-coverage-functions=95',
    '--test',
    ...files,
  ],
  { cwd: root, stdio: 'inherit' }
);
