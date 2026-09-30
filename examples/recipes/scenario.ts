import { createScenario, createSession } from 'mimlet';

export const checkout = createScenario({ name: 'checkout' })
  .node('customer', [], (_, session) => ({ id: `user-${session.sequence('id', 1)}` }))
  .node('lines', [], () => [{ quantity: 2, priceCents: 1500 }])
  .node('order', ['customer', 'lines'], ({ customer, lines }) => ({
    customerId: customer.id,
    totalCents: lines.reduce((sum, line) => sum + line.quantity * line.priceCents, 0),
  }));

export const shop = checkout.build(
  createSession({ seed: 42, fingerprint: 'checkout/v1', provider: 'my-test@1' })
);
// shop.order.customerId === shop.customer.id; shop.order.totalCents === 3000.
