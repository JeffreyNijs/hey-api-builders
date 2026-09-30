import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { fork } from 'node:child_process';
import type { SessionSnapshot } from '@mimlet/core';
import type { GenerationProfile, SchemaDialect } from '@mimlet/json-schema';
import {
  integer,
  MAX_RESULT_BYTES,
  PlaygroundError,
  snapshotRequest,
  type GenerationRequest,
} from './request.js';

export interface IsolatedGenerationOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}
export interface GenerationResult {
  readonly values: readonly unknown[];
  readonly replay: SessionSnapshot;
  readonly next: SessionSnapshot;
  readonly inspection: {
    readonly dialect: SchemaDialect;
    readonly profile: GenerationProfile;
    readonly validation: 'ajv';
    readonly generation: 'validated-sampling';
    readonly network: false;
    readonly identity: {
      readonly fingerprint: string;
      readonly provider: string;
      readonly configuration: string;
    };
  };
}
/** Killable process execution for JSON DATA only, not a sandbox for untrusted JavaScript. */
export async function generateIsolated(
  request: GenerationRequest,
  options: IsolatedGenerationOptions = {}
): Promise<GenerationResult> {
  const timeoutMs = integer(options.timeoutMs, 5000, 1, 30_000);
  if (
    Object.keys(options).some((key) => !['timeoutMs', 'signal'].includes(key)) ||
    (options.signal !== undefined && !(options.signal instanceof globalThis.AbortSignal))
  ) {
    throw new PlaygroundError(
      'INVALID_REQUEST',
      'Expected supported options and a native AbortSignal'
    );
  }
  if (options.signal?.aborted) {
    throw new PlaygroundError('GENERATION_ABORTED', 'Generation cancelled');
  }
  const data = snapshotRequest(request);
  return new Promise<GenerationResult>((resolve, reject) => {
    const worker = fork(new URL('./worker.js', import.meta.url), [], {
      env: {},
      execArgv: ['--max-old-space-size=128', '--max-semi-space-size=8', '--stack-size=4096'],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      serialization: 'json',
    });
    let settled = false;
    const finish = (error?: PlaygroundError, value?: GenerationResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      // A thread's termination promise can stall in native execution. A process
      // can be killed by the OS even while a regex is blocked. Reap it before
      // resolving, so cancellation never frees a slot while work remains alive.
      const stopped = new Promise<void>((resolveStop, rejectStop) => {
        if (worker.exitCode !== null || worker.signalCode !== null || !worker.pid) {
          resolveStop();
          return;
        }
        worker.once('exit', () => resolveStop());
        if (!worker.kill('SIGKILL')) {
          rejectStop(new Error('Could not stop generation process'));
        }
      });
      void stopped.then(
        () => {
          if (error) {
            reject(error);
          } else {
            resolve(value!);
          }
        },
        () => reject(new PlaygroundError('GENERATION_FAILED', 'Generation worker could not stop'))
      );
    };
    const abort = () => finish(new PlaygroundError('GENERATION_ABORTED', 'Generation cancelled'));
    const timer = setTimeout(
      () =>
        finish(new PlaygroundError('GENERATION_TIMEOUT', 'Generation exceeded its time budget')),
      timeoutMs
    );
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) {
      abort();
    }
    worker.on('message', (message: unknown) => {
      if (typeof message !== 'string' || Buffer.byteLength(message) > MAX_RESULT_BYTES) {
        finish(new PlaygroundError('GENERATION_FAILED', 'Invalid worker result'));
        return;
      }
      const parsed = JSON.parse(message) as {
        ok: boolean;
        result?: GenerationResult;
        code?: string;
        message?: string;
      };
      if (!parsed.ok) {
        finish(
          new PlaygroundError('GENERATION_FAILED', parsed.message ?? 'Schema generation failed')
        );
      } else {
        finish(undefined, parsed.result);
      }
    });
    worker.on('error', () =>
      finish(
        new PlaygroundError(
          'GENERATION_FAILED',
          'Generation worker failed or exceeded its heap budget'
        )
      )
    );
    worker.on('exit', () => {
      if (!settled) {
        finish(
          new PlaygroundError('GENERATION_FAILED', 'Generation worker exited without a result')
        );
      }
    });
    if (!settled) {
      worker.send(data, (error) => {
        if (error) {
          finish(new PlaygroundError('GENERATION_FAILED', 'Could not start generation'));
        }
      });
    }
  });
}
