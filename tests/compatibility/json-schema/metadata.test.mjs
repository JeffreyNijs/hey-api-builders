import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  fromJsonSchema,
  fromStandardJsonSchema,
  SchemaPreparationError,
} from '@mimlet/json-schema';
it('accepts known non-enumerable standard metadata only at the conversion boundary', () => {
  const document = { const: 'ok' };
  Object.defineProperty(document, '~standard', {
    value: {
      validate() {
        assert.fail();
      },
    },
  });
  const schema = {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value) => ({ value }),
      jsonSchema: { input: () => document },
    },
  };
  assert.equal(fromStandardJsonSchema(schema).buildValidated(), 'ok');
  assert.throws(() => fromJsonSchema(document), SchemaPreparationError);
  const getter = { const: 'ok' };
  Object.defineProperty(getter, '~standard', {
    get() {
      return assert.fail();
    },
  });
  schema['~standard'].jsonSchema.input = () => getter;
  assert.throws(() => fromStandardJsonSchema(schema), SchemaPreparationError);
});
