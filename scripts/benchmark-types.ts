/** Compiler measurements from a clean core tarball consumer, not an editor-latency claim. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(join(tmpdir(), 'mimlet-type-measurements-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const compiler = join(root, 'node_modules/typescript/bin/tsc');
const measurements = [];
try {
  const [packed] = JSON.parse(
    execFileSync(
      npm,
      [
        'pack',
        join(root, 'packages/core'),
        '--json',
        '--ignore-scripts',
        '--pack-destination',
        temporary,
      ],
      { cwd: temporary, encoding: 'utf8' }
    )
  );
  assert(packed?.filename);
  await writeFile(
    join(temporary, 'package.json'),
    JSON.stringify({ private: true, type: 'module' })
  );
  execFileSync(
    npm,
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      join(temporary, packed.filename),
    ],
    { cwd: temporary, stdio: 'pipe' }
  );
  await writeFile(
    join(temporary, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noEmit: true,
        types: [],
        lib: ['ES2022'],
        skipLibCheck: false,
      },
      include: ['fixture.ts'],
    })
  );
  for (const fields of [100, 500]) {
    for (const named of [false, true]) {
      const properties = Array.from({ length: fields }, (_, i) => `field${i}: 'value'`).join(',\n');
      const keys = Array.from({ length: fields }, (_, i) => `'field${i}'`).join(', ');
      await writeFile(
        join(temporary, 'fixture.ts'),
        `import { createBuilder, fluent } from '@mimlet/core';\nconst base = createBuilder(() => ({${properties}}));\nconst builder = ${named ? `fluent(base, [${keys}] as const)` : 'base'};\nexport const value: string = builder.${named ? `withField${fields - 1}('updated')` : `with({ field${fields - 1}: 'updated' })`}.build().field${fields - 1};\n`
      );
      const samples = [];
      for (let round = 0; round < 3; round++) {
        const began = performance.now();
        const output = execFileSync(
          process.execPath,
          [compiler, '-p', join(temporary, 'tsconfig.json'), '--extendedDiagnostics'],
          { cwd: temporary, encoding: 'utf8', timeout: 60000 }
        );
        const metric = (label: string): string => {
          const value = output
            .split('\n')
            .find((line) => line.startsWith(`${label}:`))
            ?.split(':')
            .slice(1)
            .join(':')
            .trim();
          assert(value, `Missing compiler metric ${label}`);
          return value;
        };
        samples.push({
          wallMs: performance.now() - began,
          checkSeconds: Number.parseFloat(metric('Check time')),
          memoryKiB: Number.parseInt(metric('Memory used')),
          types: Number(metric('Types')),
          instantiations: Number(metric('Instantiations')),
        });
      }
      measurements.push({ fields, api: named ? 'fluent' : 'with', samples });
    }
  }
  const typescript = JSON.parse(
    await readFile(join(root, 'node_modules/typescript/package.json'), 'utf8')
  ).version as string;
  await mkdir(join(root, 'test-results'), { recursive: true });
  await writeFile(
    join(root, 'test-results/typescript-performance.json'),
    JSON.stringify(
      {
        format: 1,
        runtime: process.version,
        typescript,
        platform: platform(),
        arch: arch(),
        cpu: cpus()[0]?.model,
        note: 'Cold compiler processes; 3 samples per case. Measures a fixture and packed declarations, not editor latency or an application build. No speed advantage is claimed.',
        measurements,
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    JSON.stringify(
      measurements.map(({ fields, api, samples }) => ({
        fields,
        api,
        medianWallMs: samples.map((v) => v.wallMs).sort((a, b) => a - b)[1],
        checkSeconds: samples.map((v) => v.checkSeconds),
      })),
      null,
      2
    )
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
