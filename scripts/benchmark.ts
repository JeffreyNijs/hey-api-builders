/** Bounded, correctness-checked measurements. Hardware-dependent timings are reported, not hard-coded gates. */
import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  createBuilder,
  createSession,
  captureFixture,
  restoreFixture,
  createScenario,
} from '../packages/core/dist/index.js';
import { jsonSchemaAdapter } from '../packages/json-schema/dist/index.js';
import { emitBuilders } from '../packages/codegen/dist/index.js';
const measurements: {
  name: string;
  operationsPerSample: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
}[] = [];
let checksum = '';
function measure(name: string, operations: number, run: () => unknown): void {
  for (let warmup = 0; warmup < 2; warmup++) {
    run();
  }
  const samples = [];
  for (let round = 0; round < 7; round++) {
    const before = performance.now();
    const result = run();
    samples.push(performance.now() - before);
    checksum = createHash('sha256')
      .update(checksum + String(result))
      .digest('hex');
  }
  samples.sort((a, b) => a - b);
  const minMs = samples[0],
    medianMs = samples[3],
    maxMs = samples[6];
  assert(minMs !== undefined && medianMs !== undefined && maxMs !== undefined);
  measurements.push({
    name,
    operationsPerSample: operations,
    medianMs,
    minMs,
    maxMs,
  });
}
const identity = { seed: 42, fingerprint: 'benchmark/v1', provider: 'toolkit' };
measure('construct immutable 200-operation builder', 200, () => {
  let b = createBuilder(() => ({ n: 0 }));
  for (let i = 0; i < 200; i++) {
    b = b.with({ n: i });
  }
  assert.equal(b.build().n, 199);
  return b.describe().operations.length;
});
const simple = createBuilder(() => ({ n: 1, values: [] })).with({ n: 2 });
measure('build shallow records', 5000, () => {
  const values = simple.buildList(5000);
  assert.equal(values.length, 5000);
  assert.notEqual(values[0], values[1]);
  return values.reduce((sum, v) => sum + v.n, 0);
});
let long = createBuilder(() => ({ n: 0 }));
for (let i = 0; i < 200; i++) {
  long = long.with({ n: i });
}
measure('replay long operation chains', 1000, () => {
  const values = long.buildList(1000);
  assert.equal(values.at(-1)?.n, 199);
  return values.length;
});
measure('seeded named stream draws', 5000, () => {
  const session = createSession(identity).scope('entity', 'field');
  let total = 0;
  for (let i = 0; i < 5000; i++) {
    total += session.integer(0, 1000);
  }
  return total;
});
const shared = { id: 1, date: new Date(1), bytes: new Uint8Array([1, 2, 3]) };
const graph: { shared: typeof shared; duplicate: typeof shared; self?: unknown } = {
  shared,
  duplicate: shared,
};
graph.self = graph;
measure('capture and restore cyclic fixture graphs', 200, () => {
  let total = 0;
  for (let i = 0; i < 200; i++) {
    const copy = restoreFixture(captureFixture(graph));
    assert(
      copy !== null &&
        typeof copy === 'object' &&
        'self' in copy &&
        'shared' in copy &&
        'duplicate' in copy
    );
    assert(
      copy.shared !== null &&
        typeof copy.shared === 'object' &&
        'bytes' in copy.shared &&
        copy.shared.bytes instanceof Uint8Array
    );
    assert.equal(copy.self, copy);
    assert.equal(copy.shared, copy.duplicate);
    total += copy.shared.bytes.length;
  }
  return total;
});
const recipe = createScenario()
  .node('lines', [], () => [2, 3])
  .node('total', ['lines'], ({ lines }) => lines.reduce((a, b) => a + b, 0));
measure('correlated scenario construction', 1000, () => {
  const values = recipe.buildList(1000, createSession(identity));
  assert.equal(values.at(-1)?.total, 5);
  return values.length;
});
const schema = {
  type: 'object',
  properties: {
    id: { type: 'integer', minimum: 1, maximum: 100 },
    role: { enum: ['reader', 'editor'] },
  },
  required: ['id', 'role'],
  additionalProperties: false,
};
measure('prepare JSON Schema and independent validator', 5, () => {
  for (let i = 0; i < 5; i++) {
    assert(jsonSchemaAdapter(schema).check({ id: 1, role: 'reader' }));
  }
  return 5;
});
const provider = jsonSchemaAdapter(schema, { profile: 'random' });
measure('generate from prepared JSON Schema', 100, () => {
  const session = provider.session(42);
  let total = 0;
  for (let i = 0; i < 100; i++) {
    const value = provider.create(session);
    assert(provider.check(value));
    assert(
      value !== null && typeof value === 'object' && 'id' in value && typeof value.id === 'number'
    );
    total += value.id;
  }
  return total;
});
const models = Array.from({ length: 100 }, (_, i) => ({
  name: `Model${i}Builder`,
  source: { kind: 'factory' as const, module: '../models.js', export: `model${i}` },
  fields: ['id', 'name'],
}));
measure('emit deterministic named classes', 100, () => {
  const a = emitBuilders(models),
    b = emitBuilders(models);
  assert.deepEqual(a, b);
  return JSON.stringify(a).length;
});
const report = {
  format: 1,
  runtime: process.version,
  platform: platform(),
  architecture: arch(),
  cpu: cpus()[0]?.model,
  samples: 7,
  warmups: 2,
  checksum,
  measurements,
  notes:
    'Medians include the explicit correctness checks inside each operation. No absolute latency or peak-memory guarantee.',
};
await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../test-results/performance.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n'
);
console.log(JSON.stringify(report, null, 2));
