import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';

import { createBuilder, createSchemaBuilder } from '../dist/index.js';

describe('callback and record boundaries', () => {
  it('does not bind application callbacks to private builder state', async () => {
    const standard = {
      version: 1,
      vendor: 'receiver-test',
      validate(value) {
        assert.equal(this, standard);
        return { value };
      },
    };
    let calls = 0;
    const checkReceiver = (receiver) => {
      assert.equal(receiver, undefined);
      calls++;
    };
    const base = createSchemaBuilder({ '~standard': standard }, function (value) {
      checkReceiver(this);
      return { value };
    })
      .withFactory(function (value) {
        checkReceiver(this);
        return { value: value + 1 };
      })
      .replaceFactory(function (value) {
        checkReceiver(this);
        return { value: value * 2 };
      })
      .transform(function (value, original) {
        checkReceiver(this);
        return { value: value.value + original };
      });
    assert.deepEqual(base.buildValidated(2), { value: 6 });
    assert.deepEqual(await base.buildValidatedAsync(3), { value: 9 });
    const asynchronous = base.transformAsync(async function (value) {
      checkReceiver(this);
      return { value: value.value + 1 };
    });
    assert.deepEqual(await asynchronous.buildValidatedAsync(4), { value: 13 });
    assert.equal(calls, 13);
  });

  it('still respects an explicitly bound application factory', async () => {
    const owner = { id: 'owned' };
    function factory() {
      return { id: this.id };
    }
    const builder = createBuilder(factory.bind(owner));
    assert.deepEqual(builder.build(), { id: 'owned' });
    assert.deepEqual(await builder.buildAsync(), { id: 'owned' });
  });

  it('requires explicit replacement across either side of the plain-record boundary', () => {
    class PartialModel {
      name = 'partial';
    }
    const original = { id: 'required', name: 'original' };
    const patches = [
      new PartialModel(),
      new Date(),
      new Map(),
      [],
      null,
      undefined,
      1,
      runInNewContext('({ name: "foreign" })'),
    ];
    const builder = createBuilder(() => original);
    for (const patch of patches) {
      assert.throws(() => builder.with(patch).build(), /use replace/);
      assert.throws(() => builder.withFactory(() => patch).build(), /use replace/);
      assert.equal(builder.replace(patch).build(), patch);
    }
    assert.deepEqual(original, { id: 'required', name: 'original' });
  });
});
