import { test, expect } from '@playwright/test';

test('the packed core works as native browser ESM without Node polyfills', async ({ page }) => {
  await page.goto('http://127.0.0.1:4180/');
  const result = await page.evaluate(async () => {
    const {
      createBuilder,
      createSchemaBuilder,
      createSession,
      restoreSession,
      captureFixture,
      restoreFixture,
      cloneFixture,
      createScenario,
      setPath,
      fixtureValue,
    } = await import('/core/index.js');
    const identity = {
      fingerprint: 'browser/v1',
      provider: 'native@1',
      configuration: 'conformance',
    };
    const session = createSession({ ...identity, seed: 42 });
    const builder = createBuilder((session) => ({
      id: session.sequence('id', 1),
      age: session.scope('age').integer(18, 80),
    }));
    const before = session.snapshot();
    const initial = builder.buildList(5, session);
    const repeated = builder.buildList(5, restoreSession(before, identity));
    const base = createBuilder(() => ({ name: 'base', nested: { a: 1 } }));
    const changed = base
      .with({ name: 'Ada' })
      .transform((value) => setPath(value, ['nested', 'a'], 2));
    const model = createSchemaBuilder(
      {
        '~standard': {
          version: 1,
          vendor: 'browser',
          validate: async (input) => ({ value: { age: Number(input.age) } }),
        },
      },
      () => ({ age: '42' })
    );
    const output = await model.buildValidatedAsync();
    const buffer = new ArrayBuffer(8);
    const graph = {
      date: new Date(0),
      map: new Map(),
      set: new Set(),
      bytes: new Uint8Array(buffer),
      view: new DataView(buffer),
      large: 2n ** 60n,
    };
    graph.self = graph;
    graph.map.set('self', graph);
    graph.set.add(graph);
    graph.bytes[0] = 7;
    const restored = restoreFixture(captureFixture(graph));
    const cloned = cloneFixture(graph);
    const scenario = createScenario()
      .node('customer', [], () => ({ id: 'one' }))
      .node('order', ['customer'], ({ customer }) => ({ owner: customer.id }));
    const overridden = scenario
      .override('customer', () => ({ id: 'two' }))
      .build(createSession({ ...identity, seed: 2 }));
    const promise = Promise.resolve(7);
    return {
      replay: JSON.stringify(initial) === JSON.stringify(repeated),
      base: base.build(),
      changed: changed.build(),
      output,
      cycle:
        restored.self === restored &&
        restored.map.get('self') === restored &&
        restored.set.has(restored),
      buffer: restored.bytes.buffer === restored.view.buffer && restored.bytes[0] === 7,
      date: restored.date.getTime(),
      bigint: String(restored.large),
      cloned: cloned !== graph && cloned.self === cloned && cloned.bytes.buffer !== buffer,
      scenario: overridden,
      promise: createBuilder(() => fixtureValue(promise)).build().value === promise,
      nodePolyfill: 'process' in globalThis,
    };
  });
  expect(result).toEqual({
    replay: true,
    base: { name: 'base', nested: { a: 1 } },
    changed: { name: 'Ada', nested: { a: 2 } },
    output: { age: 42 },
    cycle: true,
    buffer: true,
    date: 0,
    bigint: String(2n ** 60n),
    cloned: true,
    scenario: { customer: { id: 'two' }, order: { owner: 'two' } },
    promise: true,
    nodePolyfill: false,
  });
});
