import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { ApiContractError, asyncApi, fromAsyncApiMessage, messageExpression } from '@mimlet/api';
import { BuilderValidationError, cloneFixture, restoreSession } from 'mimlet';
const pointer = (value) => value.replace(/~/g, '~0').replace(/\//g, '~1');
function spec(
  version = '3.1.0',
  message = { payload: { const: { id: 'event-1' } } },
  address = 'events'
) {
  if (version.startsWith('2.'))
    return {
      asyncapi: version,
      defaultContentType: 'application/json',
      channels: { [address]: { publish: { operationId: 'events', message } } },
    };
  return {
    asyncapi: version,
    defaultContentType: 'application/json',
    channels: { events: { address, messages: { event: message } } },
    operations: { events: { action: 'receive', channel: { $ref: '#/channels/events' } } },
  };
}
const failure = (run) => assert.throws(run, ApiContractError);
const branch = (source) =>
  source.asyncapi.startsWith('2.') ? source.channels.events.publish : source.operations.events;
const messageOf = (source) =>
  source.asyncapi.startsWith('2.')
    ? source.channels.events.publish.message
    : source.channels.events.messages.event;
const descriptor = (type = 'string') => ({ type });
const binaryFormat = 'application/x-example-binary;version=1';
const binary = {
  id: 'binary/v1',
  prepare(schema) {
    assert.equal(schema, 'bytes');
    return {
      identity: { fingerprint: 'bytes-v1', provider: 'binary-test' },
      create: () => new Uint8Array([1, 2]),
      issues: (value) =>
        value instanceof Uint8Array && value.length === 2
          ? []
          : [{ message: 'Expected two bytes' }],
    };
  },
};

describe('AsyncAPI native operation contracts', () => {
  it('maps legacy publish/subscribe from the application perspective and supports modern actions', () => {
    for (const version of ['2.0.0', '2.6.0', '3.0.0', '3.1.0']) {
      const source = spec(version);
      const api = asyncApi(source);
      const prepared = api.message();
      assert.equal(api.operations()[0].action, 'receive');
      assert.deepEqual(prepared.builder().buildValidated(), { payload: { id: 'event-1' } });
      assert.deepEqual(prepared.serialize(prepared.create()), {
        action: 'receive',
        address: 'events',
        headers: {},
        contentType: 'application/json',
        payload: '{"id":"event-1"}',
      });
      assert.equal(api.messages()[0].messageId, version.startsWith('2.') ? 'message0' : 'event');
      assert.equal(fromAsyncApiMessage(source).buildValidated().payload.id, 'event-1');
      if (version.startsWith('2.')) {
        const op = source.channels.events.publish;
        delete source.channels.events.publish;
        source.channels.events.subscribe = op;
      } else source.operations.events.action = 'send';
      assert.equal(
        asyncApi(source).message({ operationId: 'events', channel: 'events', action: 'send' })
          .metadata.action,
        'send'
      );
    }
    const s = spec('2.6.0');
    delete s.channels.events.publish.operationId;
    assert.equal(asyncApi(s).operations()[0].operationId, 'publish:events');
  });
  it('selects channel-message references and validates exactly one permitted definition', () => {
    const source = spec();
    source.channels.events.messages = {
      added: {
        payload: {
          type: 'object',
          properties: { kind: { const: 'added' } },
          required: ['kind'],
          additionalProperties: false,
        },
      },
      removed: {
        payload: {
          type: 'object',
          properties: { kind: { const: 'removed' } },
          required: ['kind'],
          additionalProperties: false,
        },
      },
    };
    const api = asyncApi(source);
    failure(() => api.message());
    failure(() => api.message({ messageId: 'missing' }));
    const prepared = api.message({ messageId: 'added' });
    assert.equal(prepared.create().payload.kind, 'added');
    assert.equal(prepared.check({ payload: { kind: 'removed' } }), false);
    assert.throws(
      () =>
        prepared
          .builder()
          .with({ payload: { kind: 'removed' } })
          .buildValidated(),
      BuilderValidationError
    );
    source.operations.events.messages = [{ $ref: '#/channels/events/messages/removed' }];
    assert.equal(asyncApi(source).message().create().payload.kind, 'removed');
    source.operations.events.messages.push(source.operations.events.messages[0]);
    failure(() => asyncApi(source).message());
    source.operations.events.messages = [{ $ref: '#/components/messages/removed' }];
    source.components = { messages: { removed: source.channels.events.messages.removed } };
    failure(() => asyncApi(source).message());
    const overlap = spec();
    overlap.channels.events.messages.other = { payload: {} };
    const ambiguous = asyncApi(overlap, { maxAttempts: 2 }).message({ messageId: 'event' });
    assert.equal(ambiguous.check({ payload: { id: 'event-1' } }), false);
    assert.match(ambiguous.issues({ payload: { id: 'event-1' } })[0].message, /exactly one/);
    failure(() => ambiguous.create());
  });
  it('retains legacy oneOf and native message references', () => {
    const source = spec('2.6.0', {
      oneOf: [{ $ref: '#/components/messages/A' }, { name: 'b', payload: { const: 2 } }],
    });
    source.components = { messages: { A: { messageId: 'a', payload: { const: 1 } } } };
    const api = asyncApi(source);
    assert.deepEqual(
      api.messages().map((m) => m.messageId),
      ['a', 'b']
    );
    assert.equal(api.message({ messageId: 'a' }).create().payload, 1);
    assert.equal(api.message({ messageId: 'b' }).create().payload, 2);
    source.channels.events.publish.message.oneOf.push({ name: 'b', payload: {} });
    failure(() => asyncApi(source).message({ messageId: 'a' }));
    for (const oneOf of [[], {}, null]) failure(() => asyncApi(spec('2.6.0', { oneOf })).message());
    failure(() => asyncApi(spec('2.6.0', { name: 1, payload: {} })).message());
  });
  it('preserves message header/payload validation, nested issues and scoped replay', () => {
    const source = spec('3.1.0', {
      headers: {
        type: 'object',
        properties: { token: { type: 'string', minLength: 1 } },
        required: ['token'],
        additionalProperties: false,
      },
      payload: { type: 'integer', minimum: 1, maximum: 100 },
      correlationId: { location: '$message.header#/token' },
    });
    const p = asyncApi(source).message();
    const session = p.session(123);
    const before = session.snapshot();
    const values = p.builder().buildValidatedList(5, session);
    assert.deepEqual(values, p.builder().buildValidatedList(5, restoreSession(before, p.identity)));
    assert.equal(typeof p.correlationId(values[0]), 'string');
    assert.equal(p.check({ payload: 1, headers: { token: '' } }), false);
    assert.deepEqual(p.issues({ payload: 1, headers: { token: '' } })[0].path, [
      'headers',
      'token',
    ]);
    assert.equal(p.check({ payload: 1, headers: [] }), false);
    assert.equal(p.check({ payload: 1, headers: { token: 'x' }, unknown: 1 }), false);
    assert.equal(p.check(null), false);
    assert.throws(
      () => p.serialize({ payload: 0, headers: { token: 'x' } }),
      BuilderValidationError
    );
    const scalarHeaders = asyncApi(spec('3.1.0', { headers: { type: 'string' } })).message();
    assert.equal(scalarHeaders.check({ headers: 'not an object' }), false);
    const untyped = asyncApi(spec('3.1.0', {})).message();
    assert.deepEqual(untyped.create(), {});
    assert.equal(untyped.correlationId({}), undefined);
    assert.deepEqual(untyped.serialize({}), {
      action: 'receive',
      address: 'events',
      headers: {},
      contentType: 'application/json',
    });
  });
  it('merges traits in order while the explicit target wins and preserves reference origins', () => {
    for (const version of ['2.6.0', '3.1.0']) {
      const source = spec(version, {
        traits: [{ $ref: 'traits.json#/common' }, { contentType: 'text/plain', title: 'later' }],
        title: 'own',
        contentType: 'application/json',
        payload: { const: 1 },
      });
      branch(source).traits = [{ summary: 'inherited', bindings: { kafka: { clientId: 'x' } } }];
      branch(source).bindings = { kafka: { clientId: 'actual' } };
      const other = {
        common: {
          contentType: 'application/xml',
          headers: { $ref: '#/Headers' },
          correlationId: { $ref: '#/Correlation' },
        },
        Headers: { type: 'object', properties: { id: { const: 'abc' } }, required: ['id'] },
        Correlation: { location: '$message.header#/id' },
      };
      const p = asyncApi(source, {
        documentUri: 'https://example.com/api.json',
        documents: { 'https://example.com/traits.json': other },
      }).message();
      assert.equal(p.create().headers.id, 'abc');
      assert.equal(p.serialize(p.create()).contentType, 'application/json');
      assert.equal(p.correlationId(p.create()), 'abc');
      assert.equal(p.metadata.bindings.operation.kafka.clientId, 'actual');
      assert.equal(p.metadata.source.includes('#'), true);
    }
    for (const trait of [{ payload: {} }, { traits: [] }])
      failure(() => asyncApi(spec('3.1.0', { traits: [trait] })).message());
    const forbidden = spec();
    forbidden.operations.events.traits = [{ channel: { $ref: '#/channels/events' } }];
    failure(() => asyncApi(forbidden));
    failure(() => asyncApi(spec('3.1.0', { traits: {} })).message());
    const invalidOp = spec();
    invalidOp.operations.events.traits = {};
    failure(() => asyncApi(invalidOp));
    const nullable = asyncApi(
      spec('3.1.0', {
        traits: [{ description: 'inherited' }, { description: null }],
        payload: { const: 1 },
      })
    ).message();
    assert.equal(nullable.create().payload, 1);
  });
  it('uses validated examples only as candidate preferences', () => {
    const source = spec('3.1.0', {
      payload: { type: 'integer', minimum: 1, maximum: 10 },
      examples: [{ name: 'sample', summary: 'metadata', payload: 7 }],
    });
    assert.equal(asyncApi(source, { profile: 'examples' }).message().create().payload, 7);
    messageOf(source).examples[0].payload = -1;
    assert.ok(asyncApi(source, { profile: 'examples' }).message().create().payload > 0);
    assert.throws(
      () =>
        asyncApi(source, { profile: 'examples' })
          .message()
          .builder()
          .with({ payload: -1 })
          .buildValidated(),
      BuilderValidationError
    );
  });
});

describe('AsyncAPI addresses, correlation and replies', () => {
  it('resolves pointer expressions with escapes and never executes getters', () => {
    const value = { headers: { 'a/b~c': 'id' }, payload: { nested: { 0: 'value' } } };
    assert.equal(messageExpression('$message.header#/a~1b~0c', value), 'id');
    assert.equal(messageExpression('$message.payload#/nested/0', value), 'value');
    assert.equal(messageExpression('$message.payload#', value), value.payload);
    for (const expression of [
      'eval(payload)',
      '$message.payload#anchor',
      '$message.payload#/%ZZ',
      '$message.payload#/bad~3',
      '$message.payload#/missing',
      '$message.header#/constructor',
    ])
      failure(() => messageExpression(expression, value));
    const getter = () => {
      throw new Error('getter executed');
    };
    failure(() =>
      messageExpression('$message.payload#', Object.defineProperty({}, 'payload', { get: getter }))
    );
    failure(() =>
      messageExpression('$message.payload#/secret', {
        payload: Object.defineProperty({}, 'secret', { get: getter }),
      })
    );
    failure(() => messageExpression('$message.payload#', { payload: undefined }));
  });
  it('validates channel parameters and exposes protocol-specific escaping explicitly', () => {
    const source = spec(
      '3.1.0',
      {
        headers: {
          type: 'object',
          properties: { tenant: { const: 'alpha' } },
          required: ['tenant'],
        },
        payload: { const: 1 },
      },
      'tenant/{tenant}/{region}'
    );
    source.channels.events.parameters = {
      tenant: { location: '$message.header#/tenant' },
      region: { enum: ['eu', 'us'], default: 'eu' },
    };
    const p = asyncApi(source).message();
    const v = p.create();
    assert.equal(p.address(v), 'tenant/alpha/eu');
    assert.equal(p.address(v, { parameters: { region: 'us' } }), 'tenant/alpha/us');
    assert.equal(
      p.address(v, { encodeParameter: (value) => value.toUpperCase() }),
      'tenant/ALPHA/EU'
    );
    for (const parameters of [
      { unknown: 'x' },
      { tenant: 'wrong' },
      { region: 'invalid' },
      { region: 1 },
    ])
      failure(() => p.address(v, { parameters }));
    failure(() => p.address(v, { encodeParameter: () => '{bad}' }));
    failure(() => p.address(v, { encodeParameter: () => 1 }));
    const absent = spec('3.1.0', { payload: {} }, 'x/{id}');
    const a = asyncApi(absent).message();
    failure(() => a.address(a.create()));
    absent.channels.events.parameters = { id: {} };
    const b = asyncApi(absent).message();
    failure(() => b.address(b.create()));
    const unspecified = spec('3.1.0', { payload: { const: 1 } }, null);
    const u = asyncApi(unspecified).message();
    failure(() => u.address(u.create()));
    assert.equal(u.address(u.create(), { address: 'chosen-topic' }), 'chosen-topic');
    failure(() => u.address(u.create(), { address: 'bad\naddress' }));
    const legacy = spec('2.6.0', { payload: { const: 1 } }, 'x/{id}');
    legacy.channels['x/{id}'].parameters = { id: { schema: { type: 'integer', minimum: 1 } } };
    const l = asyncApi(legacy).message();
    assert.equal(l.address(l.create(), { parameters: { id: 2 } }), 'x/2');
    failure(() => l.address(l.create(), { parameters: { id: 0 } }));
    failure(() => l.address(l.create(), { parameters: { id: NaN } }));
  });
  it('uses the original request for a declared dynamic reply address', () => {
    const source = spec(
      '3.1.0',
      { payload: { const: { responseTo: 'result-topic' } } },
      'request-topic'
    );
    source.operations.events.action = 'send';
    source.channels.result = {
      address: null,
      messages: { result: { payload: { const: { ok: true } } } },
    };
    source.operations.events.reply = {
      channel: { $ref: '#/channels/result' },
      address: { location: '$message.payload#/responseTo' },
      messages: [{ $ref: '#/channels/result/messages/result' }],
    };
    const api = asyncApi(source);
    const reply = api.reply();
    assert.equal(reply.metadata.action, 'receive');
    assert.equal(reply.metadata.reply, true);
    assert.equal(
      reply.serialize(reply.create(), { request: api.message().create() }).address,
      'result-topic'
    );
    failure(() => reply.serialize(reply.create()));
    source.channels.result.address = 'not-null';
    failure(() => asyncApi(source).reply());
    delete source.operations.events.reply.address;
    assert.equal(
      asyncApi(source)
        .reply()
        .address({ payload: { ok: true } }),
      'not-null'
    );
    source.operations.events.action = 'receive';
    assert.equal(asyncApi(source).reply().metadata.action, 'send');
    failure(() => asyncApi(spec('2.6.0')).reply());
    failure(() => asyncApi(spec()).reply());
  });
  it('retains protocol metadata without connecting or guessing credentials', () => {
    const source = spec();
    source.servers = { primary: { host: 'example.invalid:9092', protocol: 'kafka' } };
    source.operations.events.security = [{ $ref: '#/components/securitySchemes/auth' }];
    source.channels.events.bindings = { kafka: { partitions: 3 } };
    messageOf(source).bindings = { kafka: { key: { type: 'string' } } };
    const prepared = asyncApi(source).message();
    assert.equal(prepared.metadata.servers.primary.protocol, 'kafka');
    assert.equal(prepared.metadata.bindings.channel.kafka.partitions, 3);
    assert.equal(prepared.metadata.security.length, 1);
  });
});

describe('AsyncAPI schema languages and trust boundaries', () => {
  it('uses declared JSON and OpenAPI formats without converting native language payloads', () => {
    for (const schemaFormat of [
      'application/vnd.aai.asyncapi+json;version=3.1.0',
      'application/schema+json;version=draft-07',
      'application/vnd.oai.openapi;version=3.0.0',
      'application/vnd.oai.openapi+json;version=3.1.0',
    ]) {
      const source = spec('3.1.0', {
        payload: { schemaFormat, schema: { type: 'integer', minimum: 1 } },
      });
      assert.ok(asyncApi(source).message().create().payload >= 1);
    }
    const legacy = spec('2.6.0', {
      schemaFormat: 'application/schema+json;version=draft-07',
      payload: { type: 'string' },
    });
    assert.equal(typeof asyncApi(legacy).message().create().payload, 'string');
    for (const version of ['2.6.0', '3.1.0']) {
      const msg = version.startsWith('2.')
        ? { schemaFormat: binaryFormat, payload: 'bytes', contentType: 'application/octet-stream' }
        : {
            payload: { schemaFormat: binaryFormat, schema: 'bytes' },
            contentType: 'application/octet-stream',
          };
      const source = spec(version, msg);
      failure(() => asyncApi(source).message());
      const prepared = asyncApi(source, { schemaFormats: { [binaryFormat]: binary } }).message();
      const v = prepared.builder().buildValidated();
      assert.deepEqual(v.payload, new Uint8Array([1, 2]));
      v.payload[0] = 9;
      assert.equal(prepared.create().payload[0], 1);
      assert.deepEqual(
        prepared.serialize(prepared.create(), {
          codecs: { 'application/octet-stream': { encode: (value) => value } },
        }).payload,
        new Uint8Array([1, 2])
      );
      assert.equal(prepared.check({ payload: 'wrong' }), false);
    }
  });
  it('preserves native record classes through a paired clone hook', () => {
    class Row {
      constructor(id) {
        this.id = id;
      }
    }
    const factory = {
      id: 'row/v1',
      prepare: () => ({
        identity: { fingerprint: 'row', provider: 'test' },
        create: () => new Row(7),
        issues: (v) => (v instanceof Row && v.id === 7 ? [] : [{ message: 'Wrong row' }]),
        clone: (v) => {
          if (!(v instanceof Row)) throw new Error('wrong');
          return new Row(v.id);
        },
      }),
    };
    const p = asyncApi(
      spec('3.1.0', {
        payload: { schemaFormat: binaryFormat, schema: 'row' },
        contentType: 'text/plain',
      }),
      { schemaFormats: { [binaryFormat]: factory } }
    ).message();
    assert.ok(p.create().payload instanceof Row);
    assert.equal(p.check({ payload: {} }), false);
    assert.equal(
      p.serialize(p.create(), { codecs: { 'text/plain': { encode: (v) => String(v.id) } } })
        .payload,
      '7'
    );
  });
  it('keeps every native callback synchronous and checks its capability contract', async () => {
    const source = spec('3.1.0', { payload: { schemaFormat: binaryFormat, schema: 'bytes' } });
    for (const factory of [
      {},
      { id: '', prepare: () => ({}) },
      { id: 'v1', prepare: () => null },
      { id: 'v1', prepare: () => ({ identity: {}, create: () => 1, issues: () => [] }) },
    ])
      failure(() => asyncApi(source, { schemaFormats: { [binaryFormat]: factory } }).message());
    const make = (changes) => ({
      id: 'v1',
      prepare: () => ({ ...binary.prepare('bytes'), ...changes }),
    });
    for (const changes of [
      { issues: () => 1 },
      { issues: () => [{}] },
      { issues: () => Promise.reject(new Error('observed')) },
    ])
      failure(() =>
        asyncApi(source, { schemaFormats: { [binaryFormat]: make(changes) } })
          .message()
          .create()
      );
    failure(() =>
      asyncApi(source, {
        schemaFormats: {
          [binaryFormat]: { id: 'v1', prepare: () => Promise.reject(new Error('observed')) },
        },
      }).message()
    );
    failure(() =>
      asyncApi(source, {
        schemaFormats: {
          [binaryFormat]: make({ create: () => Promise.reject(new Error('observed')) }),
        },
      })
        .message()
        .create()
    );
    const p = asyncApi(source, {
      schemaFormats: {
        [binaryFormat]: make({ clone: () => Promise.reject(new Error('observed')) }),
      },
    }).message();
    assert.equal(p.check({ payload: new Uint8Array([1, 2]) }), false);
    const a = asyncApi(spec('3.1.0', { payload: { const: 1 } }, 'x/{id}'));
    const s = spec('3.1.0', { payload: { const: 1 } }, 'x/{id}');
    s.channels.events.parameters = { id: { default: 'x' } };
    const b = asyncApi(s).message();
    failure(() =>
      b.address(b.create(), { encodeParameter: () => Promise.reject(new Error('observed')) })
    );
    assert.equal(a.operations().length, 1);
    await setImmediate();
  });
  it('resolves explicitly supplied channels/messages and snapshots caller documents', () => {
    const source = spec();
    source.channels.events = { $ref: 'messages.json#/channels/events' };
    source.operations.events.messages = [{ $ref: 'messages.json#/channels/events/messages/event' }];
    const external = {
      channels: {
        events: { address: 'external', messages: { event: { payload: { $ref: '#/Value' } } } },
      },
      Value: { const: 3 },
    };
    const api = asyncApi(source, {
      documentUri: 'https://example.com/api.json',
      documents: { 'https://example.com/messages.json': external },
    });
    external.Value.const = 4;
    assert.equal(api.message().create().payload, 3);
    failure(() => asyncApi(source).message());
    const missing = spec();
    missing.operations.events.channel.$ref = '#/components/channels/events';
    missing.components = { channels: { events: { address: 'x' } } };
    failure(() => asyncApi(missing));
  });
  it('rejects unsupported shapes and semantic ambiguity during preparation', () => {
    for (const source of [
      {},
      { asyncapi: 3 },
      { asyncapi: '1.2.0' },
      { asyncapi: '3.2.0' },
      { asyncapi: '2.7.0' },
      { asyncapi: '3.1.0', channels: [] },
      { asyncapi: '3.1.0', operations: [] },
    ])
      failure(() => asyncApi(source));
    for (const patch of [
      { action: 'publish' },
      { action: 'send', channel: {} },
      { action: 'receive', channel: { $ref: '#/missing' } },
    ]) {
      const s = spec();
      s.operations.events = patch;
      failure(() => asyncApi(s));
    }
    const duplicate = spec('2.6.0');
    duplicate.channels.other = cloneFixture(duplicate.channels.events);
    failure(() => asyncApi(duplicate));
    const empty = spec('3.1.0');
    empty.channels.events.messages = {};
    failure(() => asyncApi(empty).message());
    const wrong = spec();
    for (const messages of [[], {}, [{ $ref: '#/channels/events/messages/missing' }]]) {
      wrong.operations.events.messages = messages;
      failure(() => asyncApi(wrong).message());
    }
    const many = spec();
    many.operations.other = { action: 'send', channel: { $ref: '#/channels/events' } };
    failure(() => asyncApi(many).message());
    failure(() => asyncApi(spec()).message({ operationId: 'missing' }));
    failure(() => asyncApi(spec('3.1.0', { payload: { schemaFormat: binaryFormat } })).message());
    failure(() => asyncApi(spec('3.1.0', { payload: { schemaFormat: '' } })).message());
    failure(() => asyncApi(spec('3.1.0', { payload: { discriminator: 'kind' } })).message());
    failure(() => asyncApi(spec('3.1.0', { contentType: 'bad' })).message());
    failure(() => asyncApi(spec('3.1.0', { correlationId: {} })).message());
    for (const address of [1, {}]) failure(() => asyncApi(spec('3.1.0', {}, address)).message());
    for (const data of [{ schema: {} }, { enum: [] }, { enum: [1] }, { default: 1 }]) {
      const s = spec();
      s.channels.events.parameters = { id: data };
      failure(() => asyncApi(s).message());
    }
    for (const maxAttempts of [0, -1, 1001, 1.5])
      failure(() => asyncApi(spec('3.1.0', {}), { maxAttempts }).message());
    const noContent = spec();
    delete noContent.defaultContentType;
    const p = asyncApi(noContent).message();
    failure(() => p.serialize(p.create()));
    assert.equal(
      p.serialize(p.create(), { contentType: 'application/json' }).payload,
      '{"id":"event-1"}'
    );
    const poisoned = JSON.parse('{"headers":{"__proto__":{"polluted":true}},"payload":1}');
    const safe = asyncApi(spec('3.1.0', { headers: {}, payload: { const: 1 } })).message();
    assert.equal(safe.check(poisoned), true);
    assert.equal({}.polluted, undefined);
    const getter = Object.defineProperty({}, 'payload', {
      enumerable: true,
      get() {
        throw new Error('getter ran');
      },
    });
    assert.equal(safe.check(getter), false);
    assert.equal(safe.check({ [Symbol('x')]: 1 }), false);
    assert.equal(safe.check(Object.defineProperty({}, 'payload', { value: 1 })), false);
  });
});
void pointer;
void descriptor;
