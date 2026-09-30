import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { TextDecoder } from 'node:util';
import { generateIsolated } from './generation.js';
import { integer, MAX_REQUEST_BYTES, PlaygroundError } from './request.js';
import type { GenerationRequest } from './request.js';

export interface PlaygroundOptions {
  readonly port?: number;
  readonly timeoutMs?: number;
  readonly maxConcurrent?: number;
}
export interface PlaygroundServer {
  readonly url: string;
  close(): Promise<void>;
}
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}
function body(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let complete = false;
    const finish = (error?: unknown) => {
      if (complete) {
        return;
      }
      complete = true;
      if (error) {
        reject(error);
        return;
      }
      try {
        const json = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
        resolve(JSON.parse(json));
      } catch {
        reject(new HttpError(400, 'Expected valid UTF-8 JSON'));
      }
    };
    request.on('data', (chunk: Buffer) => {
      if (complete) {
        return;
      }
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        finish(new HttpError(413, 'Request exceeds the size limit'));
      } else {
        chunks.push(chunk);
      }
    });
    request.once('end', () => finish());
    request.once('error', () => finish(new HttpError(400, 'Request interrupted')));
    request.once('aborted', () => finish(new HttpError(400, 'Request interrupted')));
  });
}
/** A loopback-only local application. No host override, CORS, remote imports or telemetry. */
export async function startPlayground(options: PlaygroundOptions = {}): Promise<PlaygroundServer> {
  const port = integer(options.port, 0, 0, 65535);
  const timeoutMs = integer(options.timeoutMs, 5000, 1, 30_000);
  const maxConcurrent = integer(options.maxConcurrent, 2, 1, 8);
  if (Object.keys(options).some((key) => !['port', 'timeoutMs', 'maxConcurrent'].includes(key))) {
    throw new TypeError('Unknown playground option');
  }
  const token = randomBytes(24).toString('hex');
  const files = new Map<string, { type: string; bytes: Buffer }>();
  for (const [route, filename, type] of [
    ['/', 'index.html', 'text/html; charset=utf-8'],
    ['/app.js', 'app.js', 'text/javascript; charset=utf-8'],
    ['/app.css', 'app.css', 'text/css; charset=utf-8'],
  ] as const) {
    files.set(route, {
      type,
      bytes: await readFile(new URL(`../public/${filename}`, import.meta.url)),
    });
  }
  const active = new Set<AbortController>();
  const jobs = new Set<Promise<unknown>>();
  let origin = '';
  let closing = false;
  const headers = {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cross-origin-resource-policy': 'same-origin',
    'cross-origin-opener-policy': 'same-origin',
    'content-security-policy':
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  };
  const json = (response: ServerResponse, status: number, value: unknown) => {
    if (response.destroyed || response.writableEnded) {
      return;
    }
    response.writeHead(status, {
      ...headers,
      'content-type': 'application/json; charset=utf-8',
      connection: 'close',
    });
    response.end(JSON.stringify(value));
  };
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const hosts = request.rawHeaders.filter(
        (value, index) => index % 2 === 0 && value.toLowerCase() === 'host'
      );
      if (hosts.length !== 1 || request.headers.host !== origin.slice('http://'.length)) {
        throw new HttpError(403, 'Invalid local host');
      }
      if (request.headers.origin !== undefined && request.headers.origin !== origin) {
        throw new HttpError(403, 'Cross-origin access is not allowed');
      }
      if (closing) {
        throw new HttpError(503, 'Playground is stopping');
      }
      const file = files.get(request.url ?? '');
      if (file && (request.method === 'GET' || request.method === 'HEAD')) {
        response.writeHead(200, {
          ...headers,
          'content-type': file.type,
          'content-length': file.bytes.length,
        });
        response.end(request.method === 'HEAD' ? undefined : file.bytes);
        return;
      }
      const site = request.headers['sec-fetch-site'];
      if (site !== undefined && site !== 'same-origin' && site !== 'none') {
        throw new HttpError(403, 'Cross-site access is not allowed');
      }
      if (request.url === '/session' && request.method === 'GET') {
        json(response, 200, { token, activeWorkers: active.size, maxConcurrent });
        return;
      }
      if (request.url !== '/generate' || request.method !== 'POST') {
        throw new HttpError(404, 'Not found');
      }
      const received = request.headers['x-test-builders-token'];
      if (
        typeof received !== 'string' ||
        !/^[a-f0-9]{48}$/.test(received) ||
        !timingSafeEqual(Buffer.from(received), Buffer.from(token))
      ) {
        throw new HttpError(403, 'Invalid local session token');
      }
      if (
        request.headers['content-type']?.split(';')[0]?.trim() !== 'application/json' ||
        request.headers['content-encoding']
      ) {
        throw new HttpError(415, 'Only uncompressed JSON requests are supported');
      }
      if (Number(request.headers['content-length'] ?? 0) > MAX_REQUEST_BYTES) {
        throw new HttpError(413, 'Request exceeds the size limit');
      }
      if (active.size >= maxConcurrent) {
        throw new HttpError(429, 'All generation slots are busy');
      }
      const controller = new AbortController();
      active.add(controller);
      response.once('close', () => controller.abort());
      try {
        const data = await body(request);
        const job = generateIsolated(data as GenerationRequest, {
          timeoutMs,
          signal: controller.signal,
        });
        jobs.add(job);
        try {
          json(response, 200, await job);
        } finally {
          jobs.delete(job);
        }
      } finally {
        active.delete(controller);
      }
    } catch (error) {
      const status =
        error instanceof HttpError
          ? error.status
          : error instanceof PlaygroundError
            ? error.code === 'INVALID_REQUEST'
              ? 400
              : error.code === 'GENERATION_TIMEOUT'
                ? 408
                : 422
            : 500;
      json(response, status, {
        error: {
          code: error instanceof PlaygroundError ? error.code : 'HTTP_ERROR',
          message:
            error instanceof HttpError || error instanceof PlaygroundError
              ? error.message
              : 'Playground request failed',
        },
      });
    }
  };
  const server = createServer(
    {
      requestTimeout: 10_000,
      headersTimeout: 5000,
      maxHeaderSize: 8192,
      connectionsCheckingInterval: 500,
    },
    (request, response) => {
      void handle(request, response);
    }
  );
  server.maxConnections = 32;
  server.keepAliveTimeout = 1000;
  server.maxRequestsPerSocket = 32;
  await new Promise<void>((resolve, reject) => {
    const error = (cause: Error) => reject(cause);
    server.once('error', error);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', error);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected loopback server address');
  }
  origin = `http://127.0.0.1:${address.port}`;
  let stopped: Promise<void> | undefined;
  return Object.freeze({
    url: origin,
    close() {
      if (stopped) {
        return stopped;
      }
      closing = true;
      for (const controller of active) {
        controller.abort();
      }
      stopped = Promise.all([
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        }),
        ...[...jobs].map((job) => job.catch(() => undefined)),
      ]).then(() => undefined);
      return stopped;
    },
  });
}
