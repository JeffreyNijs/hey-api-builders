import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { Worker } from 'node:worker_threads';
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
/** Interruptible worker execution for JSON DATA only, not a sandbox for untrusted JavaScript. */
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
    const worker = new Worker(new URL('./worker.js', import.meta.url), {
      workerData: data,
      env: {},
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
    });
    let settled = false;
    const finish = (error?: PlaygroundError, value?: GenerationResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      // Terminate before resolving so callers do not accumulate abandoned workers.
      void worker.terminate().then(
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
  });
}
