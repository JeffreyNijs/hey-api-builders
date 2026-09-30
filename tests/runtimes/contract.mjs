// No test framework, Node imports, network requests, environment or filesystem reads.
import {
  createBuilder,
  createSchemaBuilder,
  createSession,
  restoreSession,
  captureFixture,
  restoreFixture,
  cloneFixture,
  createScenario,
  fixtureValue,
  setPath,
  BuilderValidationError,
  SessionBudgetError,
  BuilderPathError,
} from './core/dist/index.js';
let assertions = 0;
function check(value, message) {
  assertions++;
  if (!value) throw new Error(message);
}
function same(actual, expected, message) {
  check(JSON.stringify(actual) === JSON.stringify(expected), message);
}
function throws(run, Type) {
  let caught;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  check(caught instanceof Type, `Expected ${Type.name}`);
}
const users = createBuilder((id) => ({ id, role: 'reader', notes: [] }));
const admins = users.with({ role: 'admin' }).withFactory(() => ({ notes: ['one'] }));
same(admins.build('a'), { id: 'a', role: 'admin', notes: ['one'] }, 'Fluent configuration');
same(users.build('a'), { id: 'a', role: 'reader', notes: [] }, 'Independent source');
const values = admins.buildList(2, 'a');
values[0].notes.push('two');
check(values[1].notes.length === 1, 'Fresh nested overrides');
check(Object.isFrozen(users), 'Frozen definition');
throws(() => users.buildList(-1, 'a'), RangeError);
throws(() => users.buildList(10001, 'a'), RangeError);
const nested = createBuilder(() => ({ user: { name: 'a', note: 'keep' }, items: [1, 2] }));
same(
  nested
    .transform((value) => setPath(setPath(value, ['user', 'name'], 'b'), ['items', 1], 3))
    .build(),
  { user: { name: 'b', note: 'keep' }, items: [1, 3] },
  'Persistent typed paths'
);
throws(() => setPath(nested.build(), ['missing', 'value'], 1), BuilderPathError);
throws(
  () =>
    createBuilder(() => null)
      .with({ id: 1 })
      .build(),
  TypeError
);
const date = new Date(1000);
check(
  createBuilder(() => date)
    .replace(new Date(2000))
    .build()
    .getTime() === 2000,
  'Native replacement'
);
const ordered = [];
const asyncValues = await createBuilder(async (id) => {
  ordered.push(id);
  return { id };
})
  .transformAsync(async (v) => ({ id: v.id + 1 }))
  .buildListAsync(3, 4);
same(asyncValues, [{ id: 5 }, { id: 5 }, { id: 5 }], 'Async execution');
same(ordered, [4, 4, 4], 'Sequential list');
let validations = 0;
const schema = {
  '~standard': {
    version: 1,
    vendor: 'portable',
    validate(v) {
      validations++;
      return typeof v.age === 'string'
        ? { value: { age: Number(v.age) } }
        : { issues: [{ message: 'text required', path: ['age'] }] };
    },
  },
};
const people = createSchemaBuilder(schema, () => ({ age: '42' }));
check(people.build().age === '42' && validations === 0, 'Unchecked input');
check(
  people.with({ age: '43' }).buildValidated().age === 43 && validations === 1,
  'Parsed output once'
);
throws(() => people.with({ age: 1 }).buildValidated(), BuilderValidationError);
const asynchronous = createSchemaBuilder(
  { '~standard': { version: 1, vendor: 'portable', validate: async (v) => ({ value: v + 1 }) } },
  async () => 1
);
check((await asynchronous.buildValidatedAsync()) === 2, 'Async validation');
const promise = Promise.resolve(42);
check(createBuilder(() => fixtureValue(promise)).build().value === promise, 'Promise fixture data');
const identity = { fingerprint: 'portable/v1', provider: 'test@1', configuration: 'exact' };
const session = createSession({ ...identity, seed: 42 });
const before = session.snapshot();
const stream = Array.from({ length: 32 }, () => session.integer(-100, 100));
const replay = restoreSession(JSON.parse(JSON.stringify(before)), identity);
same(
  Array.from({ length: 32 }, () => replay.integer(-100, 100)),
  stream,
  'State replay'
);
const a = createSession({ ...identity, seed: 42 });
const b = createSession({ ...identity, seed: 42 });
a.scope('unrelated').random();
check(a.scope('stable').random() === b.scope('stable').random(), 'Named random isolation');
check(a.referenceDate().toISOString() === '2000-01-01T00:00:00.000Z', 'Fixed reference date');
throws(
  () => createSession({ ...identity, seed: 42, maxOperations: 0 }).random(),
  SessionBudgetError
);
const graph = { date, map: new Map(), set: new Set(), buffer: new ArrayBuffer(8) };
graph.self = graph;
graph.view = new Uint8Array(graph.buffer, 2, 3);
graph.view[0] = 123;
graph.map.set(graph, graph.set);
graph.set.add(graph);
const cloned = restoreFixture(captureFixture(graph));
check(cloned !== graph && cloned.self === cloned, 'Captured cycles');
check(cloned.map.get(cloned) === cloned.set && cloned.set.has(cloned), 'Graph identities');
check(cloned.view.buffer === cloned.buffer && cloned.view[0] === 123, 'Shared native buffers');
for (const value of [undefined, NaN, -0, Infinity, -Infinity, 9007199254740993n])
  check(Object.is(cloneFixture(value), value), 'Lossless primitive capture');
const pollution = cloneFixture(JSON.parse('{"__proto__":{"polluted":true}}'));
check(Object.hasOwn(pollution, '__proto__') && {}.polluted === undefined, 'Own-key safety');
const order = createScenario({ name: 'order' })
  .node('lines', [], () => [2, 3])
  .node('total', ['lines'], ({ lines }) => lines.reduce((x, y) => x + y, 0));
same(
  order.override('lines', () => [5, 6]).build(session),
  { lines: [5, 6], total: 11 },
  'Relationship override'
);
same(order.build(session), { lines: [2, 3], total: 5 }, 'Scenario immutability');
check(
  (await order.node('double', ['total'], async ({ total }) => total * 2).buildAsync(session))
    .double === 10,
  'Async scenario'
);
console.log(JSON.stringify({ suite: 'packed portable core', assertions, passed: true }));
