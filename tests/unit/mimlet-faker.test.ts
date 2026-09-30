import { expect, it } from 'vitest';
import { fromFaker, fakerAdapter } from '../../packages/faker/src/index.js';
import { restoreSession } from '../../packages/core/src/index.js';
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
