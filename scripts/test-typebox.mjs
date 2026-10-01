/** Native TypeBox compatibility uses the shared packed-consumer verification harness. */
import { fileURLToPath, URL } from 'node:url';
import { checkPackedFixture } from './test-optional.mjs';
await checkPackedFixture(
  fileURLToPath(new URL('../tests/compatibility/typebox/', import.meta.url))
);
