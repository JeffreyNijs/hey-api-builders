#!/usr/bin/env node
import { startPlayground } from './server.js';
const args = process.argv.slice(2);
if (args.length === 1 && ['--help', '-h'].includes(args[0]!)) {
  console.log(
    'Usage: mimlet-playground [--port 0..65535]\nStarts a loopback-only local schema playground. Press Ctrl+C to stop.'
  );
} else if (
  args.length !== 0 &&
  (args.length !== 2 || args[0] !== '--port' || !/^\d{1,5}$/.test(args[1]!))
) {
  console.error('Usage: mimlet-playground [--port 0..65535]');
  process.exitCode = 1;
} else {
  try {
    const server = await startPlayground({ port: args.length ? Number(args[1]) : 0 });
    console.log(`Mimlet playground: ${server.url}`);
    console.log('Schemas stay on this machine. Press Ctrl+C to stop.');
    const stop = () => {
      void server.close().catch(() => {
        process.exitCode = 1;
      });
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch {
    console.error('Could not start the local playground. Check the port and installation.');
    process.exitCode = 1;
  }
}
