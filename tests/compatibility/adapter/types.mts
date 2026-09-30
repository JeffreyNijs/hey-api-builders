import { defineAdapter, fromAdapter } from '@jeffreynijs/test-builders-adapter';
import type { StandardSchemaV1 } from '@jeffreynijs/test-builders';
declare function expectType<T>(value: T): void;
declare const standard: StandardSchemaV1<{ age: string }, { age: number }>;
const adapter = defineAdapter({
  id: 'demo',
  version: '1',
  standard,
  operations: {
    create: (age: string) => ({ age }),
    encode: (value: { age: number }) => ({ age: String(value.age) }),
  },
});
expectType<{ age: string }>(fromAdapter(adapter).build('42'));
expectType<{ age: number }>(fromAdapter(adapter).buildValidated('42'));
expectType<{ age: number }>(adapter.fromFactory(() => ({ age: '1' })).buildValidated());
// @ts-expect-error Required factory arguments remain required.
fromAdapter(adapter).build();
// @ts-expect-error Patches target input, not decoded output.
fromAdapter(adapter).with({ age: 42 });
// @ts-expect-error Custom factories cannot violate schema input.
adapter.fromFactory(() => ({ age: 42 }));
const asynchronous = defineAdapter({
  id: 'async',
  version: '1',
  standard,
  operations: { create: async () => ({ age: '1' }) },
});
expectType<Promise<{ age: number }>>(fromAdapter(asynchronous).buildValidatedAsync());
// @ts-expect-error The SDK preserves async-only factory capabilities.
fromAdapter(asynchronous).buildValidated();
const validationOnly = defineAdapter({ id: 'check', version: '1', standard, operations: {} });
// @ts-expect-error Validation is not automatic data generation.
fromAdapter(validationOnly);
// @ts-expect-error An incompatible create operation is not accepted.
defineAdapter({ id: 'wrong', version: '1', standard, operations: { create: () => ({ age: 1 }) } });
// @ts-expect-error Encoding receives decoded output.
adapter.operations.encode({ age: '42' });

// A generative adapter without checkInput still satisfies the common suite.
import { assertAdapterConformance } from '@jeffreynijs/test-builders-adapter/testing';
const generatorOnly = defineAdapter({
  id: 'generator-only',
  version: '1',
  standard,
  operations: { create: () => ({ age: '42' }) },
});
void assertAdapterConformance(generatorOnly, [
  { name: 'valid', input: () => ({ age: '42' }), valid: true },
]);
