#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import {
  emitBuilders,
  emitJsonSchemaBuilders,
  selfContainedRuntime,
  writeGenerated,
  CodegenError,
} from './index.js';
import type { BuilderTarget, JsonBuilderTarget } from './index.js';
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(
      'test-builders --config builders.json --out generated [--check] [--self-contained] [--select A,B]\nJSON config: { "builders": [...module targets], "schemas": [...JSON schema targets] }. Application modules are not executed during generation.'
    );
    return;
  }
  const flags = new Map<string, string | boolean>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (
      !['--config', '--out', '--check', '--self-contained', '--select'].includes(flag) ||
      flags.has(flag)
    ) {
      throw new CodegenError('Unknown or duplicate CLI flag');
    }
    if (['--check', '--self-contained'].includes(flag)) {
      flags.set(flag, true);
    } else {
      const value = args[++index];
      if (!value || value.startsWith('--')) {
        throw new CodegenError(`Missing value for ${flag}`);
      }
      flags.set(flag, value);
    }
  }
  const config = flags.get('--config');
  const out = flags.get('--out');
  if (typeof config !== 'string' || typeof out !== 'string') {
    throw new CodegenError('--config and --out are required');
  }
  if ((await stat(config)).size > 2_000_000) {
    throw new CodegenError('Configuration exceeds 2 MB');
  }
  const input = JSON.parse(await readFile(config, 'utf8')) as {
    builders?: BuilderTarget[];
    schemas?: JsonBuilderTarget[];
  };
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !['builders', 'schemas'].includes(key))
  ) {
    throw new CodegenError('Invalid data-only generation configuration');
  }
  const selection =
    typeof flags.get('--select') === 'string'
      ? String(flags.get('--select')).split(',')
      : undefined;
  const all = [...(input.builders ?? []), ...(input.schemas ?? [])];
  if (selection?.some((name) => !all.some((target) => target.name === name))) {
    throw new CodegenError('Unknown selected builder');
  }
  const options = flags.get('--self-contained')
    ? { runtimeModule: './builder-runtime/index.js' }
    : {};
  const files = [
    ...emitBuilders(
      (input.builders ?? []).filter((target) => !selection || selection.includes(target.name)),
      options
    ),
    ...(await emitJsonSchemaBuilders(
      (input.schemas ?? []).filter((target) => !selection || selection.includes(target.name)),
      options
    )),
    ...(flags.get('--self-contained') ? await selfContainedRuntime() : []),
  ];
  const result = await writeGenerated(out, files, { check: flags.get('--check') === true });
  console.log(JSON.stringify(result));
  if (flags.get('--check') && !result.clean) {
    process.exitCode = 1;
  }
}
try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Builder generation failed');
  process.exitCode = 2;
}
