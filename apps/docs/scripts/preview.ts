/** Loopback-only static preview. VitePress 1.6 preview ignores --host and caches the file inventory. */
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { base } from '../content.ts';

const directory = await realpath(fileURLToPath(new URL('../.vitepress/dist/', import.meta.url)));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1] ?? ''))) {
  throw new TypeError('Usage: preview.ts [--port 0..65535]');
}
const port = args.length ? Number(args[1]) : 4174;
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new RangeError('Preview port must be between 0 and 65535');
}
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};
const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(request.method ?? '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname === '/' || pathname === base.slice(0, -1)) {
      response.writeHead(302, { Location: base }).end();
      return;
    }
    if (!pathname.startsWith(base)) {
      throw new Error('Outside site');
    }
    const route = decodeURIComponent(pathname.slice(base.length)) || 'index.html';
    if (route.includes('\\') || route.includes('\0') || route.split('/').includes('..')) {
      throw new Error('Invalid path');
    }
    const file = await realpath(resolve(directory, route));
    const inside = relative(directory, file);
    if (isAbsolute(inside) || inside.startsWith('..')) {
      throw new Error('Outside site');
    }
    const body = await readFile(file);
    const headers = {
      'Accept-Ranges': 'bytes',
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
    };
    // Safari only plays video from servers that honour a single byte range, as Pages does.
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(body.length - Number(range[2]), 0);
      const end =
        range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      if (start > end || start >= body.length) {
        response.writeHead(416, { 'Content-Range': `bytes */${body.length}` }).end();
        return;
      }
      response.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${body.length}`,
      });
      response.end(request.method === 'HEAD' ? undefined : body.subarray(start, end + 1));
      return;
    }
    response.writeHead(200, headers);
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') {
    console.log(`Mimlet preview: http://127.0.0.1:${address.port}${base}`);
  }
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close());
}
