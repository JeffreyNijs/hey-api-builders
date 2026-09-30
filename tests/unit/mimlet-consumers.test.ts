import { expect, it } from 'vitest';
import { fixtureLoader, jsonResponseResolver } from '../../packages/consumers/src/index.js';
it('keeps preview fixtures independent and observes HEAD response semantics', async () => {
  const loader = fixtureLoader('user', () => ({ names: ['Ada'] }));
  const first = await loader({});
  first.user.names.push('mutated');
  expect((await loader({})).user.names).toEqual(['Ada']);
  const resolve = jsonResponseResolver(() => ({ id: 42 }));
  expect(await (await resolve(new Request('https://example.test'))).json()).toEqual({ id: 42 });
  expect(
    await (await resolve(new Request('https://example.test', { method: 'HEAD' }))).text()
  ).toBe('');
});
