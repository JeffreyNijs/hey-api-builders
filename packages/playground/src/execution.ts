import { Buffer } from 'node:buffer';
import { restoreSession } from 'mimlet';
import {
  jsonSchemaAdapter,
  SchemaPreparationError,
  SchemaGenerationError,
} from '@mimlet/json-schema';
import { MAX_RESULT_BYTES, snapshotRequest } from './request.js';

export function executeGeneration(data: unknown): string {
  try {
    const request = snapshotRequest(data);
    const adapter = jsonSchemaAdapter(request.schema, {
      ...(request.references ? { references: request.references } : {}),
      ...(request.dialect ? { dialect: request.dialect } : {}),
      profile: request.profile ?? 'minimal',
      maxSchemaNodes: 10_000,
      maxSchemaDepth: 48,
      maxSchemaCharacters: 256_000,
      maxValueDepth: 12,
      maxValueNodes: 10_000,
      maxArrayLength: 100,
      maxStringLength: 1000,
      maxAttempts: 12,
    });
    const session = request.replay
      ? restoreSession(request.replay, adapter.identity)
      : adapter.session(request.seed ?? 1);
    const replay = session.snapshot();
    const values: unknown[] = [];
    for (let index = 0; index < (request.count ?? 3); index++) {
      values.push(adapter.create(session));
    }
    const result = {
      values,
      replay,
      next: session.snapshot(),
      inspection: { ...adapter.metadata, validation: 'ajv', identity: adapter.identity },
    };
    const message = JSON.stringify({ ok: true, result });
    if (Buffer.byteLength(message) > MAX_RESULT_BYTES) {
      throw new Error('Result budget');
    }
    return message;
  } catch (error) {
    const message =
      error instanceof SchemaPreparationError
        ? `Schema preparation failed at ${error.schemaPath.slice(0, 512) || '/'}. Check the supported keywords, references and size limits.`
        : error instanceof SchemaGenerationError
          ? 'No valid fixture was found within the sampling budget. This does not prove the schema is impossible.'
          : 'Generation or replay failed. Check the schema, replay identity and resource limits.';
    return JSON.stringify({ ok: false, message });
  }
}
