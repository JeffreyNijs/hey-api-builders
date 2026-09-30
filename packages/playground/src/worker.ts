import { executeGeneration } from './execution.js';

// This entrypoint only transports data; the same execution module has direct conformance coverage.
process.once('message', (request) => {
  const result = executeGeneration(request);
  process.send?.(result, () => process.disconnect?.());
});
