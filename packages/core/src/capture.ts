/** Portable, data-only fixture capture. No constructor names or source code are evaluated. */
export interface CaptureOptions {
  readonly maxNodes?: number;
  readonly maxDepth?: number;
  readonly maxEntries?: number;
  readonly maxCharacters?: number;
  readonly maxBufferBytes?: number;
}
export class FixtureCaptureError extends Error {
  constructor(
    readonly code: 'UNSUPPORTED_FIXTURE' | 'CAPTURE_LIMIT' | 'INVALID_CAPTURE',
    message: string
  ) {
    super(message);
    this.name = 'FixtureCaptureError';
  }
}
/** Box promise/thenable data so a builder does not confuse it with async execution. */
export function fixtureValue<T>(value: T): Readonly<{ value: T }> {
  return Object.freeze({ value });
}
const views = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
  DataView,
};
type Token = [string, unknown?];
type Node = { kind: string; data: unknown };
function budgets(options: CaptureOptions) {
  const limits = {
    maxNodes: options.maxNodes ?? 10_000,
    maxDepth: options.maxDepth ?? 100,
    maxEntries: options.maxEntries ?? 100_000,
    maxCharacters: options.maxCharacters ?? 10_000_000,
    maxBufferBytes: options.maxBufferBytes ?? 1_000_000,
  };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a nonnegative safe integer`);
    }
  }
  if (limits.maxDepth > 256) {
    throw new RangeError('Capture depth cannot exceed 256');
  }
  return limits;
}
function limited(condition: boolean, label: string): void {
  if (condition) {
    throw new FixtureCaptureError('CAPTURE_LIMIT', `Fixture capture exceeded ${label}`);
  }
}
function unsupported(message: string): never {
  throw new FixtureCaptureError('UNSUPPORTED_FIXTURE', message);
}
/** Captures supported data graphs, including cycles and shared ArrayBuffer views. */
export function captureFixture(value: unknown, options: CaptureOptions = {}): string {
  const limit = budgets(options);
  const nodes: Node[] = [];
  const seen = new Map<object, number>();
  let entries = 0;
  let characters = 0;
  let bufferBytes = 0;
  const text = (value: string) => {
    characters += value.length;
    limited(characters > limit.maxCharacters, 'text budget');
    return value;
  };
  const encode = (value: unknown, depth: number): Token => {
    limited(depth > limit.maxDepth, 'depth budget');
    entries += 1;
    limited(entries > limit.maxEntries, 'entry budget');
    if (value === null) {
      return ['null'];
    }
    if (typeof value === 'undefined') {
      return ['undefined'];
    }
    if (typeof value === 'boolean') {
      return ['boolean', value];
    }
    if (typeof value === 'string') {
      return ['string', text(value)];
    }
    if (typeof value === 'number') {
      return ['number', Object.is(value, -0) ? '-0' : String(value)];
    }
    if (typeof value === 'bigint') {
      return ['bigint', text(String(value))];
    }
    if (typeof value !== 'object') {
      return unsupported('Functions and symbols require an explicit application serializer');
    }
    const previous = seen.get(value);
    if (previous !== undefined) {
      return ['ref', previous];
    }
    limited(nodes.length >= limit.maxNodes, 'node budget');
    const id = nodes.length;
    seen.set(value, id);
    const node: Node = { kind: '', data: null };
    nodes.push(node);
    const prototype = Object.getPrototypeOf(value);
    const properties = () => {
      const result: [string, Token][] = [];
      for (const name of Reflect.ownKeys(value)) {
        if (Array.isArray(value) && name === 'length') {
          continue;
        }
        if (typeof name !== 'string') {
          return unsupported('Symbol properties require an explicit application serializer');
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, name);
        if (!descriptor) {
          return unsupported('Object properties changed during capture');
        }
        if (!('value' in descriptor) || !descriptor.enumerable) {
          return unsupported('Accessors and non-enumerable properties are not captured implicitly');
        }
        result.push([text(name), encode(descriptor.value, depth + 1)]);
      }
      return result;
    };
    const nativeProperties = (allowed: (key: PropertyKey) => boolean = () => false) => {
      if (Reflect.ownKeys(value).some((name) => !allowed(name))) {
        unsupported('Custom native-object properties require an explicit serializer');
      }
    };
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) {
        unsupported('Array subclasses require an explicit serializer');
      }
      limited(value.length > limit.maxEntries, 'array length budget');
      node.kind = 'array';
      node.data = [value.length, properties()];
    } else if (prototype === Object.prototype || prototype === null) {
      node.kind = prototype === null ? 'null-object' : 'object';
      node.data = properties();
    } else if (prototype === Date.prototype) {
      nativeProperties();
      node.kind = 'date';
      node.data = encode((value as Date).getTime(), depth + 1);
    } else if (prototype === Map.prototype) {
      nativeProperties();
      node.kind = 'map';
      limited((value as Map<unknown, unknown>).size > limit.maxEntries, 'entry budget');
      node.data = [...(value as Map<unknown, unknown>)].map(([key, item]) => [
        encode(key, depth + 1),
        encode(item, depth + 1),
      ]);
    } else if (prototype === Set.prototype) {
      nativeProperties();
      node.kind = 'set';
      limited((value as Set<unknown>).size > limit.maxEntries, 'entry budget');
      node.data = [...(value as Set<unknown>)].map((item) => encode(item, depth + 1));
    } else if (prototype === RegExp.prototype) {
      nativeProperties((name) => name === 'lastIndex');
      const expression = value as RegExp;
      if (!Number.isSafeInteger(expression.lastIndex) || expression.lastIndex < 0) {
        unsupported('RegExp lastIndex must be a nonnegative safe integer');
      }
      node.kind = 'regexp';
      node.data = [text(expression.source), expression.flags, expression.lastIndex];
    } else if (prototype === ArrayBuffer.prototype) {
      nativeProperties();
      node.kind = 'buffer';
      const bytes = new Uint8Array(value as ArrayBuffer);
      bufferBytes += bytes.byteLength;
      limited(bufferBytes > limit.maxBufferBytes, 'buffer budget');
      node.data = text(Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''));
    } else if (ArrayBuffer.isView(value)) {
      limited(value.buffer.byteLength > limit.maxBufferBytes, 'buffer budget');
      const match = Object.entries(views).find(
        ([, constructor]) => prototype === constructor.prototype
      );
      if (!match) {
        return unsupported('Unsupported ArrayBuffer view');
      }
      nativeProperties(
        (name) =>
          match[0] !== 'DataView' &&
          typeof name === 'string' &&
          /^(0|[1-9][0-9]*)$/.test(name) &&
          Number.isSafeInteger(Number(name)) &&
          Number(name) < (value as Exclude<ArrayBufferView, DataView> & { length: number }).length
      );
      node.kind = 'view';
      node.data = [match[0], encode(value.buffer, depth + 1), value.byteOffset, value.byteLength];
    } else {
      return unsupported(
        'Custom classes, promises, weak collections, and host resources require an explicit serializer'
      );
    }
    return ['ref', id];
  };
  const root = encode(value, 0);
  const result = JSON.stringify({ format: 'test-builders/fixture', version: 1, root, nodes });
  limited(result.length > limit.maxCharacters, 'encoded character budget');
  return result;
}
/** Restores data only. The return type is unknown until the consumer validates it. */
export function restoreFixture(capture: string, options: CaptureOptions = {}): unknown {
  const limit = budgets(options);
  const fail = (): never => {
    throw new FixtureCaptureError('INVALID_CAPTURE', 'Invalid or unsupported fixture capture');
  };
  if (typeof capture !== 'string') {
    fail();
  }
  limited(capture.length > limit.maxCharacters, 'encoded character budget');
  let document: { format: string; version: number; root: unknown; nodes: Node[] };
  try {
    document = JSON.parse(capture);
  } catch {
    return fail();
  }
  if (
    !document ||
    document.format !== 'test-builders/fixture' ||
    document.version !== 1 ||
    !Array.isArray(document.nodes)
  ) {
    fail();
  }
  limited(document.nodes.length > limit.maxNodes, 'node budget');
  const nodes = document.nodes;
  const values: unknown[] = new Array(nodes.length);
  let entries = 0;
  let bufferBytes = 0;
  const count = () => {
    entries += 1;
    limited(entries > limit.maxEntries, 'entry budget');
  };
  const size = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  const list = (value: unknown): unknown[] => {
    if (!Array.isArray(value)) {
      return fail();
    }
    return value;
  };
  const decode = (input: unknown): unknown => {
    count();
    const token = list(input);
    if (token.length < 1 || token.length > 2) {
      return fail();
    }
    const [kind, value] = token;
    if (kind === 'null' && token.length === 1) {
      return null;
    }
    if (kind === 'undefined' && token.length === 1) {
      return undefined;
    }
    if (kind === 'boolean' && typeof value === 'boolean' && token.length === 2) {
      return value;
    }
    if (kind === 'string' && typeof value === 'string' && token.length === 2) {
      return value;
    }
    if (
      kind === 'number' &&
      typeof value === 'string' &&
      (value === '-0' || String(Number(value)) === value)
    ) {
      return Number(value);
    }
    if (kind === 'bigint' && typeof value === 'string' && /^(0|-?[1-9][0-9]*)$/.test(value)) {
      return BigInt(value);
    }
    if (kind === 'ref' && size(value) && value < values.length) {
      return values[value];
    }
    return fail();
  };
  // Allocate graph identities before resolving any edge, including cyclic edges.
  for (const [index, node] of nodes.entries()) {
    if (!node || typeof node.kind !== 'string') {
      fail();
    }
    const data = node.data;
    switch (node.kind) {
      case 'object':
        values[index] = {};
        break;
      case 'null-object':
        values[index] = Object.create(null);
        break;
      case 'array': {
        const array = list(data);
        if (array.length !== 2) {
          fail();
        }
        const [length] = array;
        if (!size(length)) {
          fail();
        }
        limited((length as number) > limit.maxEntries, 'array length budget');
        values[index] = new Array(length as number);
        break;
      }
      case 'map':
        values[index] = new Map();
        break;
      case 'set':
        values[index] = new Set();
        break;
      case 'date': {
        const timestamp = decode(data);
        if (typeof timestamp !== 'number') {
          fail();
        }
        values[index] = new Date(timestamp as number);
        break;
      }
      case 'regexp': {
        const parts = list(data);
        if (
          parts.length !== 3 ||
          typeof parts[0] !== 'string' ||
          typeof parts[1] !== 'string' ||
          !size(parts[2])
        ) {
          fail();
        }
        try {
          values[index] = new RegExp(parts[0] as string, parts[1] as string);
        } catch {
          return fail();
        }
        (values[index] as RegExp).lastIndex = parts[2] as number;
        break;
      }
      case 'buffer': {
        if (typeof data !== 'string' || data.length % 2 !== 0 || !/^[a-f0-9]*$/.test(data)) {
          fail();
        }
        const hex = data as string;
        bufferBytes += hex.length / 2;
        limited(bufferBytes > limit.maxBufferBytes, 'buffer budget');
        const bytes = new Uint8Array(hex.length / 2);
        for (let at = 0; at < bytes.length; at += 1) {
          bytes[at] = parseInt(hex.slice(at * 2, at * 2 + 2), 16);
        }
        values[index] = bytes.buffer;
        break;
      }
      case 'view':
        break;
      default:
        return fail();
    }
  }
  for (const [index, node] of nodes.entries()) {
    if (node.kind !== 'view') {
      continue;
    }
    const parts = list(node.data);
    if (
      parts.length !== 4 ||
      typeof parts[0] !== 'string' ||
      !Object.hasOwn(views, parts[0]) ||
      !size(parts[2]) ||
      !size(parts[3])
    ) {
      fail();
    }
    const buffer = decode(parts[1]);
    if (!(buffer instanceof ArrayBuffer)) {
      fail();
    }
    const name = parts[0] as keyof typeof views;
    const constructor = views[name] as new (
      buffer: ArrayBuffer,
      offset: number,
      length: number
    ) => ArrayBufferView;
    const bytesPerElement =
      name === 'DataView' ? 1 : (constructor as typeof Uint8Array).BYTES_PER_ELEMENT;
    if ((parts[3] as number) % bytesPerElement !== 0) {
      fail();
    }
    try {
      values[index] = new constructor(
        buffer as ArrayBuffer,
        parts[2] as number,
        (parts[3] as number) / bytesPerElement
      );
    } catch {
      return fail();
    }
  }
  for (const [index, node] of nodes.entries()) {
    if (node.kind === 'object' || node.kind === 'null-object' || node.kind === 'array') {
      const data = node.kind === 'array' ? list(node.data)[1] : node.data;
      const names = new Set();
      for (const item of list(data)) {
        const pair = list(item);
        if (
          pair.length !== 2 ||
          typeof pair[0] !== 'string' ||
          names.has(pair[0]) ||
          (node.kind === 'array' && pair[0] === 'length')
        ) {
          fail();
        }
        if (
          node.kind === 'array' &&
          /^(0|[1-9][0-9]*)$/.test(pair[0] as string) &&
          Number(pair[0]) < 0xffffffff &&
          Number(pair[0]) >= (values[index] as unknown[]).length
        ) {
          fail();
        }
        names.add(pair[0]);
        Object.defineProperty(values[index], pair[0] as string, {
          value: decode(pair[1]),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
    } else if (node.kind === 'map') {
      for (const item of list(node.data)) {
        const pair = list(item);
        if (pair.length !== 2) {
          fail();
        }
        (values[index] as Map<unknown, unknown>).set(decode(pair[0]), decode(pair[1]));
      }
    } else if (node.kind === 'set') {
      for (const item of list(node.data)) {
        (values[index] as Set<unknown>).add(decode(item));
      }
    }
  }
  return decode(document.root);
}
/** Clone supported fixture data, preserving graph aliases but not property descriptors. */
export function cloneFixture<T>(value: T, options?: CaptureOptions): T {
  return restoreFixture(captureFixture(value, options), options) as T;
}
