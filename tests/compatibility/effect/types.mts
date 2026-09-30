import * as S from 'effect/Schema';
import { fromEffect, fromEffectAsync, fromEffectFactory, effectAdapter } from '@mimlet/effect';
import type { GenerationSession } from '@mimlet/core';
declare const session: GenerationSession;
declare function expectType<T>(value: T): void;
const schema = S.Struct({ age: S.NumberFromString });
const b = fromEffect(schema);
expectType<{ readonly age: string }>(b.build(session));
expectType<{ readonly age: number }>(b.buildValidated(session));
// @ts-expect-error Factory sessions are explicit.
b.build();
// @ts-expect-error Input patch is not parsed output.
b.with({ age: 42 });
// @ts-expect-error Parsed output is not any or string.
expectType<string>(b.buildValidated(session).age);
// @ts-expect-error Required fields cannot be omitted.
b.omit('age');
const c = fromEffectFactory(schema, (age: string) => ({ age }));
expectType<{ readonly age: number }>(c.buildValidated('42'));
// @ts-expect-error Custom factory must produce encoded input.
fromEffectFactory(schema, () => ({ age: 42 }));
// @ts-expect-error Required arguments are retained.
c.buildValidated();
const asyncB = fromEffectAsync(schema);
expectType<Promise<{ readonly age: number }>>(asyncB.buildValidatedAsync(session));
// @ts-expect-error Async encoder is not synchronously callable.
asyncB.build(session);
const asyncC = fromEffectFactory(schema, async (age: string) => ({ age }));
// @ts-expect-error Async factories preserve async-only capability.
asyncC.buildValidated('42');
const adapter = effectAdapter(schema);
expectType<{ readonly age: string }>(adapter.encode({ age: 42 }));
// @ts-expect-error Encoding takes decoded output.
adapter.encode({ age: '42' });
declare const requiringService: S.Schema<string, string, { readonly service: unique symbol }>;
// @ts-expect-error Effect runtime requirements must be provided explicitly, not ignored.
fromEffect(requiringService);
