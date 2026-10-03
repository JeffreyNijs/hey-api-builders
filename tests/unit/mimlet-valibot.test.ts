import { expect, it, expectTypeOf } from 'vitest';
import * as v from 'valibot';
import { fromValibot, valibotAdapter } from '../../packages/valibot/src/index.js';
it('generates schema input and preserves Valibot output transforms', () => {
  const schema = v.pipe(v.string(), v.transform(Number));
  const builder = fromValibot(schema).replace('42');
  expectTypeOf(builder.build()).toEqualTypeOf<string>();
  expectTypeOf(builder.buildValidated()).toEqualTypeOf<number>();
  expect(builder.buildValidated()).toBe(42);
});

it('exposes the generation session that session-less builds use', () => {
  const Ticket = v.object({ id: v.pipe(v.string(), v.uuid()), seats: v.number() });
  const tickets = fromValibot(Ticket);
  const generation = valibotAdapter(Ticket).generation();
  const list = tickets.buildList(3);
  expect(list).toEqual(tickets.buildList(3, generation.session()));
  expect(new Set(list.map((ticket) => ticket.id)).size).toBe(3);
  expect(generation.identity.fingerprint).toEqual(expect.any(String));
  expect(valibotAdapter(Ticket).generation().identity).toEqual(generation.identity);
});
