import { it } from 'node:test';
import { z } from 'zod';
import { type } from 'arktype';
import * as v from 'valibot';
import { defineAdapter } from '@mimlet/adapter';
import { assertAdapterConformance } from '@mimlet/adapter/testing';

for (const [vendor, schema] of [
  ['Zod', z.string().transform(Number)],
  ['ArkType', type('string').pipe(Number)],
  ['Valibot', v.pipe(v.string(), v.transform(Number))],
]) {
  it(`${vendor} passes the public adapter conformance suite with transformed output`, async () => {
    const adapter = defineAdapter({
      id: vendor,
      version: 'pinned-fixture',
      standard: schema,
      operations: {},
    });
    await assertAdapterConformance(adapter, [
      {
        name: 'string input to numeric output',
        input: () => '42',
        valid: true,
        output: (value) => value === 42,
      },
      { name: 'reject null input', input: () => null, valid: false },
    ]);
  });
}
