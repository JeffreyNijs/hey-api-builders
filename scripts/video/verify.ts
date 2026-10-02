/**
 * Check that a video still tells the truth: install the exact published packages it names in a
 * temporary project, run its example and type-check its deliberate mistakes.
 *
 *   node scripts/video/verify.ts <id>
 */
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface Facts {
  /** Exact registry versions, including the TypeScript used for `errors`. */
  packages: Record<string, string>;
  /** An ES module whose standard output the video shows. */
  program: string;
  stdout: string;
  /** Lines appended to `program` that must fail type-checking with `errors`, in order. */
  mistakes?: string;
  errors?: readonly string[];
}

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error) {
    throw result.error;
  }
  return { code: result.status ?? 1, output: `${result.stdout}${result.stderr}`.trim() };
}

const id = process.argv[2];
if (!id) {
  throw new Error('Usage: node scripts/video/verify.ts <id>');
}
const { facts } = (await import(new URL(`videos/${id}.ts`, import.meta.url).href)) as {
  facts?: Facts;
};
if (!facts) {
  throw new Error(`videos/${id}.ts does not export facts.`);
}

const directory = await mkdtemp(join(tmpdir(), `mimlet-video-${id}-`));
const failures: string[] = [];
try {
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({ private: true, type: 'module', dependencies: facts.packages }, null, 2)
  );
  const install = run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], directory);
  if (install.code !== 0) {
    throw new Error(`npm install failed:\n${install.output}`);
  }

  await writeFile(join(directory, 'example.mjs'), facts.program);
  const example = run('node', ['example.mjs'], directory);
  if (example.code !== 0 || example.output !== facts.stdout) {
    failures.push(`example output\n  expected: ${facts.stdout}\n  received: ${example.output}`);
  }

  if (facts.mistakes) {
    await writeFile(join(directory, 'mistakes.ts'), `${facts.program}\n${facts.mistakes}`);
    const compiler = run(
      join(directory, 'node_modules', '.bin', 'tsc'),
      [
        ...['--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--lib', 'ES2022,DOM'],
        ...['--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'mistakes.ts'],
      ],
      directory
    );
    const reported = compiler.output.split('\n').filter((entry) => entry.includes(': error TS'));
    (facts.errors ?? []).forEach((expected, index) => {
      if (!reported[index]?.includes(`error ${expected}`)) {
        failures.push(
          `type error ${index + 1}\n  expected: ${expected}\n  received: ${reported[index] ?? '(none)'}`
        );
      }
    });
    if (reported.length !== (facts.errors ?? []).length) {
      failures.push(
        `expected ${facts.errors?.length ?? 0} type errors, received ${reported.length}`
      );
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`${id}: the video no longer matches the published packages.\n`);
  console.error(failures.join('\n\n'));
  process.exitCode = 1;
} else {
  const versions = Object.entries(facts.packages).map(([name, version]) => `${name}@${version}`);
  const checked = facts.mistakes ? 'output and type errors match' : 'output matches';
  const against = versions.length > 0 ? versions.join(', ') : 'the commands it pins';
  console.log(`${id}: ${checked} ${against}.`);
}
