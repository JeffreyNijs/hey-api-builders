import { it } from 'node:test';
import { defineAdapter } from '@mimlet/adapter';
import { assertAdapterConformance } from '@mimlet/adapter/testing';
import { jsonSchemaAdapter } from '@mimlet/json-schema';
for (const dialect of ['draft-07', 'draft-2019-09', 'draft-2020-12']) {
  it(`${dialect} satisfies the shared adapter contract`, async () => {
    const native = jsonSchemaAdapter({ type: 'integer', minimum: 1 }, { dialect });
    await assertAdapterConformance(
      defineAdapter({
        id: dialect,
        version: 'locked',
        standard: native.standard,
        operations: { checkInput: native.check },
      }),
      [
        { name: 'valid integer', input: () => 2, valid: true, output: (value) => value === 2 },
        { name: 'invalid integer', input: () => 0, valid: false },
      ]
    );
  });
}
