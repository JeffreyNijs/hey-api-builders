import { expect, it } from 'vitest';
import { fromFaker, fromFakerSchema, fakerAdapter } from '../../packages/faker/src/index.js';
import { restoreSession, type StandardSchemaV1 } from '../../packages/core/src/index.js';
it('replays realistic values without inheriting the wall clock', () => {
  const options = { fingerprint: 'users/v1' };
  const provider = fakerAdapter(options);
  const builder = fromFaker(
    (faker) => ({ name: faker.person.fullName(), date: faker.date.recent() }),
    options
  );
  const session = provider.session(42);
  const before = session.snapshot();
  const first = builder.buildList(3, session);
  expect(first).toEqual(builder.buildList(3, restoreSession(before, provider.identity)));
  expect(first[0]?.date.getUTCFullYear()).toBeLessThanOrEqual(2000);
});
it('rejects a missing session before invoking the factory', async () => {
  const options = { fingerprint: 'users/v1' };
  const missing = /requires an explicit GenerationSession/;
  let calls = 0;
  const users = fromFaker((faker) => {
    calls++;
    return { name: faker.person.firstName() };
  }, options);
  // @ts-expect-error Faker sessions are explicit.
  expect(() => users.build()).toThrow(missing);
  // @ts-expect-error Lists require the same explicit session.
  expect(() => users.buildList(2)).toThrow(TypeError);
  // @ts-expect-error Direct instances require a session too.
  expect(() => fakerAdapter(options).instance()).toThrow(missing);
  const people: StandardSchemaV1<{ name: string }> = {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value) => ({ value: value as { name: string } }),
    },
  };
  const validated = fromFakerSchema(
    people,
    async (faker) => ({ name: faker.person.firstName() }),
    options
  );
  // @ts-expect-error Asynchronous validated builds require the same explicit session.
  await expect(validated.buildValidatedAsync()).rejects.toThrow(missing);
  expect(calls).toBe(0);
  expect(typeof users.build(fakerAdapter(options).session(1)).name).toBe('string');
});
