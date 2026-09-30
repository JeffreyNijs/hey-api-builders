import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import {
  jsonSchemaAdapter,
  fromJsonSchema,
  NegativeCaseError,
  SchemaGenerationError,
} from '@jeffreynijs/test-builders-json-schema';
import { BuilderValidationError, restoreSession } from '@jeffreynijs/test-builders';

describe('generation capabilities', () => {
  it('uses the 2019-09 validator while adapting tuple and definition sampling', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2019-09/schema',
      type: 'array',
      definitions: { code: { type: 'string', const: 'v2019' } },
      items: [{ $ref: '#/definitions/code' }, { type: 'integer', minimum: 2 }],
      minItems: 2,
      additionalItems: false,
    };
    const a = jsonSchemaAdapter(schema);
    assert.equal(a.metadata.dialect, 'draft-2019-09');
    assert.equal(a.create()[0], 'v2019');
    assert.equal(a.check(['v2019', 3, 4]), false);
    assert.equal(a.check(['v2019', 3]), true);
    const sibling = jsonSchemaAdapter({
      $schema: schema.$schema,
      $defs: { n: { type: 'integer', maximum: 10 } },
      $ref: '#/$defs/n',
      minimum: 5,
    });
    assert.equal(sibling.check(2), false);
    assert.equal(sibling.check(sibling.create()), true);
    const dependent = jsonSchemaAdapter({
      $schema: schema.$schema,
      type: 'object',
      properties: { a: { const: true }, b: { type: 'string' } },
      required: ['a'],
      dependentRequired: { a: ['b'] },
    });
    assert.equal(dependent.check(dependent.create()), true);
  });
  it('samples both declared numeric boundaries and replays boundary choices', () => {
    const a = jsonSchemaAdapter(
      { type: 'integer', minimum: 3, maximum: 9 },
      { profile: 'boundary' }
    );
    const session = a.session(42);
    const snapshot = session.snapshot();
    const values = Array.from({ length: 20 }, () => a.create(session));
    assert.deepEqual(new Set(values), new Set([3, 9]));
    const restored = restoreSession(snapshot, a.identity);
    assert.deepEqual(
      values,
      Array.from({ length: 20 }, () => a.create(restored))
    );
  });
  it('retains original constraints when composing nested boundary hints', () => {
    const candidates = [
      { type: 'string', minLength: 1, maxLength: 3 },
      {
        type: 'array',
        items: { type: 'integer', minimum: -2, maximum: -1 },
        minItems: 1,
        maxItems: 3,
      },
      {
        type: 'object',
        properties: {
          a: { type: 'string', const: 'fixed' },
          b: { enum: [1, 2] },
          c: { type: 'integer' },
          d: { type: 'string', pattern: '^x$', default: 'x' },
        },
        required: ['a', 'b', 'c', 'd'],
        additionalProperties: false,
      },
      { anyOf: [{ type: 'number', minimum: 0.5, maximum: 1.5 }, { type: 'boolean' }] },
      { type: 'integer', minimum: 1.5, maximum: 2.5 },
      { type: 'number', minimum: 0, exclusiveMinimum: 1, maximum: 5 },
      { type: 'array', contains: { type: 'integer' }, minItems: 1, maxItems: 2 },
      true,
    ];
    for (const schema of candidates) {
      const a = jsonSchemaAdapter(schema, {
        profile: 'boundary',
        maxStringLength: 10,
        maxArrayLength: 3,
      });
      for (let seed = 1; seed <= 4; seed++) assert.equal(a.check(a.create(a.session(seed))), true);
    }
  });
  it('checks negative cases and reports observed violations rather than claiming validity', () => {
    const a = jsonSchemaAdapter({
      type: 'object',
      properties: { age: { type: 'integer', minimum: 1 } },
      required: ['age'],
      additionalProperties: false,
    });
    let calls = 0;
    const bad = a.negative(
      a.session(1),
      (value) => {
        calls++;
        value.age = -1;
        return value;
      },
      { keyword: 'minimum', instancePath: '/age', requireSingleIssue: true }
    );
    assert.equal(calls, 1);
    assert.deepEqual(bad.value, { age: -1 });
    assert.equal(bad.issues[0].keyword, 'minimum');
    assert.throws(() => a.negative(a.session(), (v) => v), NegativeCaseError);
    assert.throws(
      () => a.negative(a.session(), () => ({ age: -1 }), { keyword: 'maxLength' }),
      NegativeCaseError
    );
    assert.throws(
      () => a.negative(a.session(), () => ({ age: -1 }), { instancePath: '/wrong' }),
      NegativeCaseError
    );
    assert.throws(
      () => a.negative(a.session(), () => ({ age: -1, extra: true }), { requireSingleIssue: true }),
      NegativeCaseError
    );
    assert.equal(a.negative(a.session(), () => ({})).issues[0].keyword, 'required');
    assert.throws(() => a.negative(a.session(), null), TypeError);
    assert.throws(
      () => fromJsonSchema(a.source).replace(bad.value).buildValidated(),
      BuilderValidationError
    );
  });
  it('uses versioned custom candidates without trusting their output or mutable configuration', () => {
    const requests = [];
    const provider = {
      id: 'domain/v1',
      generate(request) {
        requests.push(request);
        request.schema.type = 'boolean';
        return request.attempt ? 'allowed' : 7;
      },
    };
    const a = jsonSchemaAdapter(
      { type: 'string', const: 'allowed' },
      { provider, profile: 'random' }
    );
    provider.generate = () => false;
    assert.equal(a.create(), 'allowed');
    assert.equal(a.identity.provider, 'domain/v1');
    assert.equal(requests.length, 2);
    assert.equal(requests[0].profile, 'random');
    assert.equal(requests[0].dialect, 'draft-2020-12');
    assert.deepEqual(requests[0].references, {});
    assert.equal(a.source.type, 'string');
    assert.throws(() => jsonSchemaAdapter(true, { provider: {} }), TypeError);
    assert.throws(
      () =>
        jsonSchemaAdapter(false, {
          provider: { id: 'bad', generate: () => 1 },
          maxAttempts: 2,
        }).create(),
      (e) => e instanceof SchemaGenerationError && e.attempts === 2
    );
  });
  it('enforces declared custom assertions and does not reinterpret them as annotations', () => {
    const keywords = { divisible: (divisor, value) => value % divisor === 0 };
    const a = jsonSchemaAdapter(
      { type: 'integer', divisible: 7, 'x-label': 'domain' },
      {
        keywords,
        annotations: ['x-label'],
        extensionIdentity: 'divisible/v1',
        provider: { id: 'multiples/v1', generate: ({ session }) => session.integer(1, 5) * 7 },
      }
    );
    keywords.divisible = () => true;
    assert.equal(a.check(9), false);
    assert.equal(a.check(a.create()), true);
    assert.equal(a.issues(9)[0].keyword, 'divisible');
    const annotationOnly = jsonSchemaAdapter(
      { type: 'integer', 'x-description': {} },
      { annotations: ['x-description'] }
    );
    assert.equal(annotationOnly.check(annotationOnly.create()), true);
    for (const options of [
      { keywords: { custom: () => true } },
      { annotations: 'text' },
      { extensionIdentity: '' },
      { extensionIdentity: 3 },
      { annotations: ['type'] },
      { annotations: ['invalid name'] },
      { annotations: ['__proto__'] },
      { annotations: ['x', 'x'] },
      { keywords: { x: undefined }, extensionIdentity: 'x' },
      { keywords: { x: () => true }, annotations: ['x'], extensionIdentity: 'x' },
    ])
      assert.throws(() => jsonSchemaAdapter(true, options), TypeError);
    assert.throws(
      () =>
        jsonSchemaAdapter(
          { type: 'integer', x: 1 },
          { keywords: { x: () => 'not-boolean' }, extensionIdentity: 'x' }
        ).create(),
      SchemaGenerationError
    );
  });
  it('observes rejected async callbacks instead of leaking unhandled rejections', async () => {
    const a = jsonSchemaAdapter(true, {
      maxAttempts: 1,
      provider: { id: 'async', generate: () => Promise.reject(new Error('no')) },
    });
    assert.throws(() => a.create(), SchemaGenerationError);
    const negative = jsonSchemaAdapter({ type: 'string' });
    assert.throws(
      () => negative.negative(negative.session(), () => Promise.reject(new Error('no'))),
      /synchronous/
    );
    const keyword = jsonSchemaAdapter(
      { x: 1 },
      {
        maxAttempts: 1,
        keywords: { x: () => Promise.reject(new Error('no')) },
        extensionIdentity: 'async',
      }
    );
    assert.throws(() => keyword.create(), SchemaGenerationError);
    await setImmediate();
  });
});
