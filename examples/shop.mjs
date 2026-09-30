/** One recipe feeds validation, UI previews, JSON responses and explicit persistence. */
import { Type } from '@sinclair/typebox';
import { createScenario } from 'mimlet';
import { fakerAdapter, fromFaker } from '@mimlet/faker';
import { fromTypeBoxFactory } from '@mimlet/typebox-legacy';
import { fixtureLoader, jsonResponseResolver, persistFixtureBatch } from '@mimlet/consumers';

const options = { fingerprint: 'shop-example/v1', configuration: 'EUR-cents' };
export const provider = fakerAdapter(options);
const Timestamp = Type.Transform(Type.Number())
  .Decode((v) => new Date(v))
  .Encode((v) => v.getTime());
const User = Type.Object(
  { id: Type.String(), name: Type.String(), joined: Timestamp },
  { additionalProperties: false }
);
const realisticUsers = fromFaker(
  (f) => ({ id: f.string.uuid(), name: f.person.fullName(), joined: f.date.recent().getTime() }),
  options
);
export const users = fromTypeBoxFactory(User, (session) => realisticUsers.build(session));
export const checkout = createScenario({ name: 'shop' })
  .node('customer', [], (_, session) => users.buildValidated(session))
  .node('lines', [], (_, session) =>
    Array.from({ length: session.integer(1, 4) }, (_, i) => ({
      sku: `TEE-${i + 1}`,
      quantity: session.integer(1, 3),
      priceCents: session.integer(1000, 4000),
    }))
  )
  .node('order', ['customer', 'lines'], ({ customer, lines }) => ({
    customerId: customer.id,
    currency: 'EUR',
    lines,
    totalCents: lines.reduce((sum, line) => sum + line.quantity * line.priceCents, 0),
  }));
// A story ID is a stable seed; rendering a different story does not alter this one.
export const loadStory = fixtureLoader('checkout', ({ id }) =>
  checkout.build(provider.session(id))
);
// Install a handler explicitly in MSW or the application test server, not inside the toolkit.
export const respondOrder = jsonResponseResolver((request) => {
  const id = new globalThis.URL(request.url).searchParams.get('id') ?? 'example';
  return checkout.build(provider.session(id)).order;
});
// The caller supplies its test database transaction. No connection is opened by this module.
export function persistOrders(count, sink, session = provider.session(42)) {
  return persistFixtureBatch(
    count,
    (index) => checkout.build(session.scope('order', index)).order,
    sink,
    {},
    { maxItems: 100 }
  );
}
