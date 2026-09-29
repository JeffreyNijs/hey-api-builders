/** Native TypeBox compatibility uses the shared packed-consumer verification harness. */
process.argv[2] = 'typebox';
await import('./test-optional.mjs');
