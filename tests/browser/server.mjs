/** Test-only server exposes a fixed set of packed core ESM files for browser conformance. */
import { startPlayground } from '@mimlet/playground';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
const playground = await startPlayground({ port: 4179 });
const directory = fileURLToPath(new URL('.', import.meta.resolve('@mimlet/core')));
const modules = new Map();
for (const name of await readdir(directory)) {
  if (/^[a-zA-Z0-9_-]+\.js$/.test(name)) {
    modules.set(`/core/${name}`, await readFile(`${directory}/${name}`));
  }
}
const core = createServer((request, response) => {
  const source = modules.get(request.url);
  response.setHeader('cache-control', 'no-store');
  if (source) {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    response.end(source);
  } else if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(
      '<!doctype html><html lang="en"><title>Core conformance</title><body><main>Core conformance</main></body></html>'
    );
  } else {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve, reject) => {
  core.once('error', reject);
  core.listen(4180, '127.0.0.1', resolve);
});
let stopping;
const stop = () => {
  stopping ??= Promise.all([
    playground.close(),
    new Promise((resolve, reject) => {
      core.close((error) => (error ? reject(error) : resolve()));
      core.closeAllConnections();
    }),
  ]).catch(() => {
    process.exitCode = 1;
  });
};
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
