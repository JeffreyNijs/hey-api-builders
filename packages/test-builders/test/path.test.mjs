import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setPath, omitPath, createBuilder, BuilderPathError } from '../dist/index.js';

describe('explicit immutable paths', () => {
  it('copies only changed containers and preserves unrelated identities', () => {
    const unrelated = new Date(1);
    const input = Object.freeze({
      profile: Object.freeze({ name: 'before' }),
      rows: [{ id: 1 }],
      unrelated,
    });
    const next = setPath(input, ['profile', 'name'], 'after');
    assert.equal(input.profile.name, 'before');
    assert.equal(next.profile.name, 'after');
    assert.equal(next.unrelated, unrelated);
    assert.equal(next.rows, input.rows);
    assert.equal(setPath(input, ['rows', 0, 'id'], 2).rows[0].id, 2);
    assert.equal(input.rows[0].id, 1);
    assert.equal(setPath(input, [], null), null);
    assert.deepEqual(
      createBuilder(() => input)
        .transform((v) => setPath(v, ['rows', 0], { id: 9 }))
        .build().rows,
      [{ id: 9 }]
    );
  });
  it('distinguishes absent optional properties, undefined and null', () => {
    const input = { profile: { a: undefined, b: null } };
    const without = omitPath(input, ['profile', 'a']);
    assert.equal(Object.hasOwn(input.profile, 'a'), true);
    assert.equal(Object.hasOwn(without.profile, 'a'), false);
    assert.equal(without.profile.b, null);
    assert.equal(Object.hasOwn(setPath(without, ['profile', 'a'], undefined).profile, 'a'), true);
    assert.deepEqual(omitPath(without, ['profile', 'absent']), without);
  });
  it('handles symbols and prototype-looking own keys without prototype setters', () => {
    const symbol = Symbol('field');
    const record = Object.create(null);
    Object.defineProperty(record, symbol, { value: { n: 1 }, enumerable: false });
    const next = setPath(record, [symbol, 'n'], 2);
    assert.equal(next[symbol].n, 2);
    assert.equal(Object.getPrototypeOf(next), null);
    assert.equal(Object.getOwnPropertyDescriptor(next, symbol).enumerable, false);
    const proto = setPath({}, ['__proto__'], { polluted: true });
    assert.equal(Object.hasOwn(proto, '__proto__'), true);
    assert.equal({}.polluted, undefined);
    assert.equal(Object.getPrototypeOf(proto), Object.prototype);
    assert.equal(Object.hasOwn(omitPath(proto, ['__proto__']), '__proto__'), false);
  });
  it('rejects accessors, missing intermediates, native values and invalid array/path operations', () => {
    const accessor = Object.defineProperty({}, 'x', {
      get() {
        return assert.fail('Getter must not execute');
      },
      enumerable: true,
    });
    const invalid = [
      [null, ['x']],
      [new Map(), ['x']],
      [accessor, ['x']],
      [accessor, ['other']],
      [{}, ['missing', 'x']],
      [[1], [2]],
      [[1], [-1]],
      [[1], ['0']],
      [[1], ['length']],
      [{}, new Array(9).fill('x')],
      [{}, null],
      [{}, [{}]],
    ];
    for (const [value, path] of invalid)
      assert.throws(() => setPath(value, path, 1), BuilderPathError);
    assert.throws(() => omitPath({}, []), BuilderPathError);
    assert.throws(() => omitPath([1], [0]), BuilderPathError);
    const sparse = [];
    sparse.length = 2;
    const next = setPath(sparse, [0], 'filled');
    assert.equal(next.length, 2);
    assert.equal(Object.hasOwn(next, '1'), false);
  });
});
