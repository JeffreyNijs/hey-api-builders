import type { GenerationSession } from 'mimlet';
import type { JsonSchemaIssue } from './index.js';
import { copyJson, type JsonSchema, type SchemaLimits } from './schema.js';

export interface NegativeTarget {
  readonly keyword?: string;
  readonly instancePath?: string;
  /** An observed issue-count check, not a claim about logically independent constraints. */
  readonly requireSingleIssue?: boolean;
}
export class NegativeCaseError extends Error {
  readonly code = 'NEGATIVE_CASE_MISMATCH';
  constructor(readonly issues: ReadonlyArray<JsonSchemaIssue>) {
    super('The mutation did not produce the requested observed schema violation');
    this.name = 'NegativeCaseError';
  }
}
export function synchronous<T>(value: T): T {
  if (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  ) {
    void Promise.resolve(value).catch(() => {});
    throw new TypeError('Generation callbacks must be synchronous');
  }
  return value;
}
export function checkedNegative(
  initial: unknown,
  mutation: (value: unknown) => unknown,
  inspect: (value: unknown) => JsonSchemaIssue[],
  maximum: Required<SchemaLimits>,
  target: NegativeTarget = {}
) {
  if (typeof mutation !== 'function') {
    throw new TypeError('A negative case requires a mutation');
  }
  const value = copyJson(synchronous(mutation(initial)), maximum, false);
  const issues = inspect(value);
  if (
    !issues.length ||
    (target.requireSingleIssue && issues.length !== 1) ||
    !issues.some(
      (issue) =>
        (target.keyword === undefined || issue.keyword === target.keyword) &&
        (target.instancePath === undefined || issue.instancePath === target.instancePath)
    )
  ) {
    throw new NegativeCaseError(issues);
  }
  return { value, issues };
}
/** Sampling hints only. Candidates still pass the unmodified original validator. */
export function boundaryHints(
  source: JsonSchema,
  maximum: Required<SchemaLimits>,
  session: GenerationSession
): JsonSchema {
  const copy = copyJson(source, maximum) as JsonSchema;
  const single = new Set([
    'items',
    'contains',
    'not',
    'if',
    'then',
    'else',
    'additionalProperties',
    'propertyNames',
    'unevaluatedProperties',
    'unevaluatedItems',
    'contentSchema',
  ]);
  const maps = new Set(['properties', 'patternProperties', '$defs', 'dependentSchemas']);
  const lists = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
  const visit = (schema: JsonSchema, path: string): void => {
    if (typeof schema === 'boolean') {
      return;
    }
    const node = schema as Record<string, unknown>;
    const upper = session.scope('boundary', path).boolean();
    if (node.const === undefined && node.enum === undefined) {
      if ((node.type === 'number' || node.type === 'integer') && node.multipleOf === undefined) {
        const low = typeof node.minimum === 'number' ? node.minimum : undefined;
        const high = typeof node.maximum === 'number' ? node.maximum : undefined;
        const selected = upper ? (high ?? low) : (low ?? high);
        if (
          selected !== undefined &&
          Number.isFinite(selected) &&
          (node.type !== 'integer' || Number.isSafeInteger(selected))
        ) {
          node.const = selected;
        }
      } else if (
        node.type === 'string' &&
        node.pattern === undefined &&
        node.format === undefined
      ) {
        const size =
          upper && typeof node.maxLength === 'number' ? node.maxLength : (node.minLength ?? 0);
        if (typeof size === 'number' && size <= maximum.maxStringLength) {
          node.minLength = size;
          node.maxLength = size;
        }
      } else if (node.type === 'array' && node.contains === undefined) {
        const size =
          upper && typeof node.maxItems === 'number' ? node.maxItems : (node.minItems ?? 0);
        if (typeof size === 'number' && size <= maximum.maxArrayLength) {
          node.minItems = size;
          node.maxItems = size;
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (single.has(key)) {
        visit(value as JsonSchema, `${path}/${key}`);
      } else if (maps.has(key)) {
        for (const [name, child] of Object.entries(value as object)) {
          visit(child as JsonSchema, `${path}/${key}/${name}`);
        }
      } else if (lists.has(key)) {
        (value as JsonSchema[]).forEach((child, index) => visit(child, `${path}/${key}/${index}`));
      }
    }
  };
  visit(copy, '');
  return copy;
}
