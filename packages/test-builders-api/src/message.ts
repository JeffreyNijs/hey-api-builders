import { cloneFixture } from '@jeffreynijs/test-builders';
import type { GenerationSession, ValidationIssue } from '@jeffreynijs/test-builders';
import type { Documents } from './document.js';
import {
  ApiContractError,
  object,
  snapshot,
  type ContractOptions,
  type JsonObject,
  type Located,
} from './document.js';

/** A native schema-format bridge. Callbacks are trusted, synchronous and side-effect free. */
export interface MessageSchemaAdapter {
  readonly identity: {
    readonly fingerprint: string;
    readonly provider: string;
    readonly configuration?: string;
  };
  create(session?: GenerationSession): unknown;
  issues(value: unknown): readonly ValidationIssue[];
  /** Required for values outside the portable fixture-capture domain, such as native record classes. */
  readonly clone?: (value: unknown) => unknown;
}
export interface MessageFormatFactory {
  readonly id: string;
  readonly prepare: (schema: unknown) => MessageSchemaAdapter;
}
export function immediate<T>(value: T, label: string): T {
  if (
    value &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  ) {
    void Promise.resolve(value).catch(() => {});
    throw new ApiContractError(`${label} must be synchronous`);
  }
  return value;
}
export function copyMessage(
  value: unknown,
  adapters: ReadonlyMap<string, MessageSchemaAdapter>,
  options: ContractOptions
): unknown {
  const record = object(value);
  const names = Reflect.ownKeys(record);
  if (names.length > (options.maxValueNodes ?? 100_000)) {
    throw new ApiContractError('Message envelope budget exhausted');
  }
  const result: JsonObject = {};
  for (const name of names) {
    const entry = Object.getOwnPropertyDescriptor(record, name);
    if (typeof name !== 'string' || !entry || !entry.enumerable || !('value' in entry)) {
      throw new ApiContractError('Message envelopes require own enumerable data properties');
    }
    const adapter = adapters.get(name);
    const clone = adapter?.clone;
    const copied = clone
      ? immediate(clone(entry.value), 'Native fixture cloning')
      : cloneFixture(entry.value, {
          maxNodes: options.maxValueNodes ?? 100_000,
          maxDepth: options.maxValueDepth ?? 64,
          maxEntries: options.maxValueNodes ?? 100_000,
          maxCharacters: options.maxSchemaCharacters ?? 1_000_000,
          maxBufferBytes: options.maxArrayLength ?? 1_000_000,
        });
    Object.defineProperty(result, name, {
      value: copied,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}
/** Runtime expressions preserve the referenced value's type; never invoke inherited getters. */
export function messageExpression(expression: string, fixture: unknown): unknown {
  const match = /^\$message\.(header|payload)#(.*)$/.exec(expression);
  if (!match) {
    throw new ApiContractError('Expected a message header/payload runtime expression');
  }
  let pointer: string;
  try {
    pointer = decodeURIComponent(match[2] ?? '');
  } catch (cause) {
    throw new ApiContractError('Invalid runtime expression fragment', '', { cause });
  }
  if (pointer && !pointer.startsWith('/')) {
    throw new ApiContractError('Runtime expressions use JSON Pointers');
  }
  const envelope = object(fixture);
  const initial = Object.getOwnPropertyDescriptor(
    envelope,
    match[1] === 'header' ? 'headers' : 'payload'
  );
  if (!initial || !('value' in initial)) {
    throw new ApiContractError('Runtime expression value is absent');
  }
  let value: unknown = initial.value;
  for (const part of pointer ? pointer.slice(1).split('/') : []) {
    if (/~(?:[^01]|$)/.test(part)) {
      throw new ApiContractError('Malformed runtime expression pointer');
    }
    const name = part.replace(/~1/g, '/').replace(/~0/g, '~');
    const entry =
      value !== null && (typeof value === 'object' || typeof value === 'function')
        ? Object.getOwnPropertyDescriptor(value, name)
        : undefined;
    if (!entry || !('value' in entry)) {
      throw new ApiContractError('Runtime expression value is absent');
    }
    value = entry.value;
  }
  if (value === undefined) {
    throw new ApiContractError('Runtime expression value is absent');
  }
  return value;
}
function merge(target: unknown, patch: unknown): unknown {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return patch;
  }
  const output =
    target && typeof target === 'object' && !Array.isArray(target) ? { ...target } : {};
  for (const [name, value] of Object.entries(patch)) {
    if (value === null) {
      delete (output as JsonObject)[name];
      continue;
    }
    Object.defineProperty(output, name, {
      value: merge(Object.hasOwn(output, name) ? (output as JsonObject)[name] : undefined, value),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return output;
}
/** Rebase only actual schema references, never references appearing in examples/default data. */
function absoluteSchema(value: unknown, uri: string, depth = 0): unknown {
  if (typeof value === 'boolean') {
    return value;
  }
  const schema = object(value);
  if (depth > 128) {
    throw new ApiContractError('Trait schema depth exhausted');
  }
  const output: JsonObject = { ...schema };
  if (typeof schema.$ref === 'string') {
    output.$ref = new URL(schema.$ref, uri).href;
  }
  for (const name of [
    'properties',
    'patternProperties',
    'definitions',
    '$defs',
    'dependentSchemas',
  ]) {
    if (schema[name] === undefined) {
      continue;
    }
    output[name] = Object.fromEntries(
      Object.entries(object(schema[name])).map(([key, item]) => [
        key,
        absoluteSchema(item, uri, depth + 1),
      ])
    );
  }
  for (const name of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
    if (schema[name] === undefined) {
      continue;
    }
    if (!Array.isArray(schema[name])) {
      throw new ApiContractError('Trait schema array is invalid');
    }
    output[name] = schema[name].map((item) => absoluteSchema(item, uri, depth + 1));
  }
  for (const name of [
    'items',
    'additionalItems',
    'additionalProperties',
    'contains',
    'not',
    'if',
    'then',
    'else',
    'propertyNames',
    'unevaluatedProperties',
    'unevaluatedItems',
  ]) {
    if (schema[name] === undefined) {
      continue;
    }
    output[name] = Array.isArray(schema[name])
      ? schema[name].map((item) => absoluteSchema(item, uri, depth + 1))
      : absoluteSchema(schema[name], uri, depth + 1);
  }
  if (schema.dependencies !== undefined) {
    output.dependencies = Object.fromEntries(
      Object.entries(object(schema.dependencies)).map(([key, item]) => [
        key,
        Array.isArray(item) ? item : absoluteSchema(item, uri, depth + 1),
      ])
    );
  }
  return output;
}
export function applyTraits(
  documents: Documents,
  location: Located,
  kind: 'message' | 'operation'
): Located {
  const original = object(location.value);
  const convert = (entry: Located): JsonObject => {
    const data = { ...object(entry.value) };
    for (const field of ['headers', 'payload']) {
      if (data[field] === undefined) {
        continue;
      }
      const schema = data[field];
      // Multi-format payload schemas keep their own language; do not interpret them as JSON Schema.
      if (schema && typeof schema === 'object' && Object.hasOwn(schema, 'schemaFormat')) {
        if (entry.uri !== location.uri) {
          throw new ApiContractError(
            'External multi-format traits require an explicitly rebased schema',
            entry.pointer
          );
        }
      } else if (
        field === 'payload' &&
        typeof data.schemaFormat === 'string' &&
        !/^(application\/(?:vnd\.aai\.asyncapi|schema|vnd\.oai\.openapi))/.test(data.schemaFormat)
      ) {
        // Legacy foreign-language payloads are handed untouched to their native format adapter.
      } else {
        data[field] = absoluteSchema(schema, entry.uri);
      }
    }
    for (const field of ['correlationId', 'bindings', 'reply']) {
      const value = data[field];
      if (value && typeof value === 'object' && typeof (value as JsonObject).$ref === 'string') {
        data[field] = { $ref: new URL((value as JsonObject).$ref as string, entry.uri).href };
      }
    }
    delete data.traits;
    return data;
  };
  if (original.traits === undefined) {
    return { ...location, value: convert(location) };
  }
  if (!Array.isArray(original.traits)) {
    throw new ApiContractError('Traits must be an array', location.pointer);
  }
  let inherited: unknown = {};
  for (const [index, value] of original.traits.entries()) {
    const trait = documents.resolve({
      value,
      uri: location.uri,
      pointer: `${location.pointer}/traits/${index}`,
    });
    const data = object(trait.value);
    const forbidden =
      kind === 'message'
        ? ['payload', 'traits']
        : ['action', 'channel', 'messages', 'message', 'traits'];
    if (forbidden.some((key) => Object.hasOwn(data, key))) {
      throw new ApiContractError('Trait contains a field that cannot be inherited', trait.pointer);
    }
    inherited = merge(inherited, convert(trait));
  }
  // The original target wins; later traits override only other inherited fields.
  return { ...location, value: snapshot(merge(inherited, convert(location)), documents.options) };
}
