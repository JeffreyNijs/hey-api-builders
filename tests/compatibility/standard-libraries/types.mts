import { z } from 'zod';
import { type } from 'arktype';
import * as v from 'valibot';
import { fromStandardJsonSchema } from '@jeffreynijs/test-builders-json-schema';
import { fromValibot } from '@jeffreynijs/test-builders-valibot';
import { createSchemaBuilder } from '@jeffreynijs/test-builders';
declare function expectType<T>(value: T): void;
const zb = fromStandardJsonSchema(
  z.object({ age: z.string() }).transform(({ age }) => ({ age: Number(age) }))
);
const ab = fromStandardJsonSchema(
  type({ age: 'string' }).pipe(({ age }) => ({ age: Number(age) }))
);
const vb = fromValibot(v.object({ age: v.pipe(v.string(), v.transform(Number)) }));
expectType<{ age: string }>(zb.build());
expectType<{ age: number }>(zb.buildValidated());
expectType<{ age: string }>(ab.build());
expectType<{ age: number }>(ab.buildValidated());
expectType<{ age: string }>(vb.build());
expectType<{ age: number }>(vb.buildValidated());
// @ts-expect-error Zod input is preserved.
zb.with({ age: 1 });
// @ts-expect-error ArkType input is preserved.
ab.with({ age: 1 });
// @ts-expect-error Valibot input is preserved.
vb.with({ age: 1 });
// @ts-expect-error Unknown keys cannot silently widen a Valibot builder.
vb.with({ unknown: true });
// @ts-expect-error Output must not degrade to any.
expectType<string>(zb.buildValidated().age);
// @ts-expect-error Output must not degrade to any.
expectType<string>(ab.buildValidated().age);
// @ts-expect-error Output must not degrade to any.
expectType<string>(vb.buildValidated().age);
const asyncSchema = v.pipeAsync(
  v.string(),
  v.checkAsync(async () => true)
);
const asyncBuilder = createSchemaBuilder(asyncSchema, async () => 'ok');
expectType<Promise<string>>(asyncBuilder.buildValidatedAsync());
// @ts-expect-error Async input generation cannot expose synchronous builds.
asyncBuilder.build();
// @ts-expect-error Native asynchronous schemas are not advertised as synchronously convertible.
fromValibot(asyncSchema);
