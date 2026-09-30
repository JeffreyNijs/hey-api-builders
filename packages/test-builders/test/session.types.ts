import {
  createBuilder,
  createSession,
  restoreSession,
  type GenerationSession,
} from '../src/index.js';
declare function expectType<T>(value: T): void;
const options = { seed: 'fixed', fingerprint: 'user/v1', provider: 'fixture@1' };
const session = createSession(options);
expectType<number>(session.integer(-10, 10));
expectType<'a' | 'b'>(session.pick(['a', 'b'] as const));
expectType<Date>(session.referenceDate());
expectType<GenerationSession>(restoreSession(session.snapshot(), options));
const users = createBuilder((session: GenerationSession) => ({ id: session.sequence('id') }));
expectType<{ id: number }>(users.build(session));
// @ts-expect-error Replaying requires an explicit identity assertion.
restoreSession(session.snapshot());
// @ts-expect-error Seed and producer identity are required.
createSession({});
// @ts-expect-error A reproducible factory explicitly requires a session.
users.build();
