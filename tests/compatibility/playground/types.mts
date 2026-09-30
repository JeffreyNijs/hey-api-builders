import {
  generateIsolated,
  startPlayground,
  type GenerationRequest,
  PlaygroundError,
} from '@jeffreynijs/test-builders-playground';
import type { SessionSnapshot } from '@jeffreynijs/test-builders';
declare function expectType<T>(value: T): void;
const request = {
  schema: { type: 'integer' },
  count: 3,
  profile: 'boundary',
} as const satisfies GenerationRequest;
const result = await generateIsolated(request);
expectType<readonly unknown[]>(result.values);
expectType<SessionSnapshot>(result.replay);
expectType<false>(result.inspection.network);
const server = await startPlayground({ port: 0, maxConcurrent: 2 });
expectType<string>(server.url);
expectType<Promise<void>>(server.close());
expectType<Error>(new PlaygroundError('GENERATION_TIMEOUT', 'timeout'));
// @ts-expect-error Schema data cannot be executable code.
generateIsolated({ schema: () => true });
// @ts-expect-error Profiles are a closed capability set.
generateIsolated({ schema: true, profile: 'anything' });
// @ts-expect-error Public schema types do not invent application outputs.
result.values[0].id;
// @ts-expect-error The local server cannot bind a public host.
startPlayground({ host: '0.0.0.0' });
// @ts-expect-error Integer timeouts are required.
generateIsolated(request, { timeoutMs: '5000' });
generateIsolated({
  schema: true,
  // @ts-expect-error No custom executable provider crosses the worker boundary.
  provider: {
    generate() {
      return 1;
    },
  },
});
