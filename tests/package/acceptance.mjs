import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import builders, { buildersPlugin, defaultConfig, defineConfig } from 'hey-api-builders';
import { createClient } from '@hey-api/openapi-ts';
import * as ts from 'typescript';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

assert.equal(builders, defineConfig);
assert.equal(buildersPlugin, defineConfig);
assert.equal(defaultConfig.name, 'hey-api-builders');
assert.equal(builders({ responses: false }).name, 'hey-api-builders');

const require = createRequire(import.meta.url);
assert.throws(
  () => require('hey-api-builders'),
  (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
);
const generated = join(process.cwd(), 'generated');
const compiled = join(process.cwd(), 'compiled');
await mkdir(compiled);
await createClient({
  input: {
    openapi: '3.1.0',
    info: { title: 'Consumer', version: '1' },
    paths: {},
    components: {
      schemas: {
        User: {
          type: 'object',
          properties: { id: { type: 'string' }, name: { type: 'string' } },
          required: ['id', 'name'],
        },
      },
    },
  },
  logs: { file: false, level: 'silent' },
  output: { path: generated, importFileExtension: '.js' },
  plugins: [
    '@hey-api/typescript',
    { name: '@faker-js/faker', compatibilityVersion: 10 },
    builders(),
  ],
});
const files = (await readdir(generated))
  .filter((file) => file.endsWith('.ts'))
  .map((file) => join(generated, file));
const program = ts.createProgram(files, {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  strict: true,
  skipLibCheck: false,
  outDir: compiled,
});
const diagnostics = ts
  .getPreEmitDiagnostics(program)
  .filter((d) => d.category === ts.DiagnosticCategory.Error);
assert.deepEqual(
  diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
  []
);
assert.equal(program.emit().emitSkipped, false);
const { UserBuilder } = await import(pathToFileURL(join(compiled, 'hey-api-builders.gen.js')).href);
assert.equal(new UserBuilder().withName('Ada').with({ id: '1' }).build().name, 'Ada');
const asynchronous = new UserBuilder().transformAsync(async (value) => value).withName('Grace');
assert.equal((await asynchronous.buildAsync()).name, 'Grace');
