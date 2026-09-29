import Type from 'typebox';
import { Type as Legacy } from '@sinclair/typebox';
import {
  fromTypeBox,
  fromTypeBoxFactory,
  typeBoxAdapter,
} from '@jeffreynijs/test-builders-typebox';
import {
  fromTypeBox as fromLegacy,
  fromTypeBoxFactory as legacyFactory,
  typeBoxAdapter as legacyAdapter,
} from '@jeffreynijs/test-builders-typebox-legacy';
declare function expectType<T>(value: T): void;
const Timestamp = Type.Codec(Type.Number())
  .Decode((value) => new Date(value))
  .Encode((value) => value.getTime());
const Event = Type.Object({
  id: Type.String(),
  timestamp: Timestamp,
  note: Type.Optional(Type.String()),
});
const events = fromTypeBox(Event);
expectType<{ id: string; timestamp: number; note?: string }>(events.build());
expectType<{ id: string; timestamp: Date; note?: string }>(events.buildValidated());
events.with({ timestamp: 1 }).omit('note');
// @ts-expect-error Patches are input-typed, not decoded output.
events.with({ timestamp: new Date() });
// @ts-expect-error Required fields cannot be omitted.
events.omit('id');
// @ts-expect-error Unknown properties are rejected.
events.with({ other: 1 });
const custom = fromTypeBoxFactory(Event, (id: string) => ({ id, timestamp: 1 }));
expectType<{ id: string; timestamp: Date; note?: string }>(custom.buildValidated('1'));
// @ts-expect-error Factory arguments remain required.
custom.build();
// @ts-expect-error The native factory generates encoded input, not decoded output.
fromTypeBoxFactory(Event, () => ({ id: 'x', timestamp: new Date() }));
const asynchronous = fromTypeBoxFactory(Event, async () => ({ id: 'x', timestamp: 1 }));
expectType<Promise<{ id: string; timestamp: Date; note?: string }>>(
  asynchronous.buildValidatedAsync()
);
// @ts-expect-error Async factories cannot advertise sync validation.
asynchronous.buildValidated();
expectType<number>(typeBoxAdapter(Timestamp).encode(new Date()));
// @ts-expect-error Encode receives decoded values.
typeBoxAdapter(Timestamp).encode(1);
const Ref = Type.Ref('User');
const context = { User: Type.Object({ id: Type.String() }) };
expectType<{ id: string }>(fromTypeBox(Ref, { context }).build());
const Pet = Type.Union([
  Type.Object({ kind: Type.Literal('cat'), lives: Type.Number() }),
  Type.Object({ kind: Type.Literal('dog'), bark: Type.Boolean() }),
]);
// @ts-expect-error Union transitions need complete replacement.
fromTypeBox(Pet).with({ kind: 'dog' });
fromTypeBox(Pet).replace({ kind: 'dog', bark: true });

const OldTimestamp = Legacy.Transform(Legacy.Number())
  .Decode((value) => new Date(value))
  .Encode((value) => value.getTime());
const OldEvent = Legacy.Object({ id: Legacy.String(), timestamp: OldTimestamp });
const oldEvents = fromLegacy(OldEvent);
expectType<{ id: string; timestamp: number }>(oldEvents.build());
expectType<{ id: string; timestamp: Date }>(oldEvents.buildValidated());
// @ts-expect-error Legacy Transform retains separate encoded/decoded types.
oldEvents.with({ timestamp: new Date() });
// @ts-expect-error Factories cannot invent missing required fields.
legacyFactory(OldEvent, () => ({ id: 'x' }));
const oldAsync = legacyFactory(OldEvent, async (id: string) => ({ id, timestamp: 1 }));
expectType<Promise<{ id: string; timestamp: Date }>>(oldAsync.buildValidatedAsync('1'));
// @ts-expect-error Async capability is preserved through the legacy adapter.
oldAsync.buildValidated('1');
expectType<number>(legacyAdapter(OldTimestamp).encode(new Date()));
