import {
  buildASTSchema,
  executeSync,
  getOperationAST,
  getVariableValues,
  isAbstractType,
  isEnumType,
  isInputObjectType,
  isInputType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  NoSchemaIntrospectionCustomRule,
  parse,
  responsePathAsArray,
  specifiedRules,
  typeFromAST,
  validate,
  validateSchema,
  valueFromASTUntyped,
  visit,
} from 'graphql';
import type {
  GraphQLError,
  GraphQLInputType,
  GraphQLOutputType,
  GraphQLResolveInfo,
  GraphQLScalarType,
} from 'graphql';
import { cloneFixture, createSchemaBuilder, createSession } from '@jeffreynijs/test-builders';
import type {
  GenerationSession,
  SchemaBuilder,
  SchemaBuilderConfig,
  StandardSchemaV1,
  ValidationIssue,
} from '@jeffreynijs/test-builders';

export interface GraphQLScalarFixture {
  readonly id: string;
  /** Encoded variable data. The native input coercion boundary remains authoritative. */
  readonly input: (session: GenerationSession) => unknown;
  /** Internal resolver value, before GraphQL output coercion. */
  readonly output: (session: GenerationSession) => unknown;
  readonly parseInput: (value: unknown) => unknown;
  readonly serialize: (value: unknown) => unknown;
  /** Decode an already serialized response for a strict response round-trip check. */
  readonly parseOutput: (value: unknown) => unknown;
}
export interface GraphQLFieldContext {
  readonly args: Readonly<Record<string, unknown>>;
  readonly parent: unknown;
  readonly path: ReadonlyArray<string | number>;
  readonly session: GenerationSession;
  readonly coordinate: string;
}
export interface GraphQLFixtureOptions extends SchemaBuilderConfig {
  readonly operationName?: string;
  readonly profile?: 'minimal' | 'random' | 'boundary';
  readonly listLength?: number;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
  readonly maxDocumentCharacters?: number;
  readonly maxTokens?: number;
  readonly scalars?: Readonly<Record<string, GraphQLScalarFixture>>;
  readonly fields?: Readonly<Record<string, (context: GraphQLFieldContext) => unknown>>;
  readonly fieldsIdentity?: string;
  /** Fixed abstract-type selections; __typename in an explicit value takes precedence. */
  readonly abstractTypes?: Readonly<Record<string, string>>;
}
export interface GraphQLFixtureIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<string | number>;
  readonly locations?: ReadonlyArray<{ readonly line: number; readonly column: number }>;
}
export interface GraphQLFixtureResult {
  readonly data?: Record<string, unknown> | null;
  readonly errors?: ReadonlyArray<GraphQLFixtureIssue>;
}
export class GraphQLFixtureError extends Error {
  readonly code = 'GRAPHQL_FIXTURE_FAILED';
  constructor(
    message: string,
    readonly issues: ReadonlyArray<GraphQLFixtureIssue> = [],
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'GraphQLFixtureError';
  }
}
function bounded(value: number | undefined, fallback: number, maximum: number): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 0 || selected > maximum) {
    throw new GraphQLFixtureError('Invalid GraphQL resource budget');
  }
  return selected;
}
function immediate(value: unknown): unknown {
  if (
    value &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  ) {
    void Promise.resolve(value).catch(() => {});
    throw new GraphQLFixtureError('GraphQL fixture callbacks must be synchronous');
  }
  return value;
}
function record(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw new GraphQLFixtureError('Expected a variable or response object');
  }
  return value as Record<string, unknown>;
}
function same(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (
    !left ||
    !right ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(left) !== Array.isArray(right)
  ) {
    return false;
  }
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        same((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])
    )
  );
}
function redact(errors: readonly GraphQLError[]): GraphQLFixtureIssue[] {
  return errors.map((error) => ({
    message: 'GraphQL validation or execution failed',
    ...(error.path ? { path: [...error.path] } : {}),
    ...(error.locations ? { locations: error.locations.map((location) => ({ ...location })) } : {}),
  }));
}
/** SDL and operation text are data. Live application resolvers are never loaded. */
export function graphqlAdapter(
  schemaText: string,
  operationText: string,
  supplied: GraphQLFixtureOptions = {}
) {
  const options = Object.freeze({ ...supplied });
  const maxDepth = bounded(options.maxDepth, 16, 64);
  const maxNodes = bounded(options.maxNodes, 10_000, 100_000);
  const maxCharacters = bounded(options.maxDocumentCharacters, 1_000_000, 10_000_000);
  const maxTokens = bounded(options.maxTokens, 10_000, 100_000);
  const listLength = bounded(options.listLength, 1, 1000);
  const profile = options.profile ?? 'minimal';
  if (!['minimal', 'random', 'boundary'].includes(profile)) {
    throw new GraphQLFixtureError('Unknown GraphQL fixture profile');
  }
  if (
    typeof schemaText !== 'string' ||
    typeof operationText !== 'string' ||
    schemaText.length + operationText.length > maxCharacters
  ) {
    throw new GraphQLFixtureError('Schema and operation must be bounded SDL strings');
  }
  const clone = (value: unknown) =>
    cloneFixture(value, {
      maxNodes,
      maxDepth: Math.max(1, maxDepth + 4),
      maxEntries: maxNodes,
      maxCharacters,
      maxBufferBytes: maxCharacters,
    });
  const wire = (value: unknown): unknown => {
    const copied = clone(value);
    const active = new Set<object>();
    const check = (value: unknown): void => {
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))
      ) {
        return;
      }
      if (typeof value !== 'object' || active.has(value)) {
        throw new GraphQLFixtureError('GraphQL wire data must be acyclic JSON');
      }
      if (!Array.isArray(value)) {
        record(value);
      }
      active.add(value);
      for (const key of Reflect.ownKeys(value)) {
        if (Array.isArray(value) && key === 'length') {
          continue;
        }
        const entry = Object.getOwnPropertyDescriptor(value, key)!;
        if (typeof key !== 'string' || !entry.enumerable || !('value' in entry)) {
          throw new GraphQLFixtureError('GraphQL wire data must contain enumerable JSON fields');
        }
        check(entry.value);
      }
      if (Array.isArray(value) && Object.keys(value).length !== value.length) {
        throw new GraphQLFixtureError('Sparse arrays are not GraphQL wire data');
      }
      active.delete(value);
    };
    check(copied);
    return copied;
  };
  let schema;
  let document;
  try {
    schema = buildASTSchema(parse(schemaText, { maxTokens }));
    document = parse(operationText, { maxTokens });
  } catch (cause) {
    throw new GraphQLFixtureError('GraphQL parsing failed', [], { cause });
  }
  const scalars = Object.fromEntries(
    Object.entries(options.scalars ?? {}).map(([name, value]) => [
      name,
      Object.freeze({ ...value }),
    ])
  );
  const fields = Object.freeze({ ...options.fields });
  const abstractTypes = Object.freeze({ ...options.abstractTypes });
  if (
    Object.keys(fields).length &&
    (typeof options.fieldsIdentity !== 'string' || !options.fieldsIdentity)
  ) {
    throw new GraphQLFixtureError('Field factories require a versioned fieldsIdentity');
  }
  for (const [coordinate, factory] of Object.entries(fields)) {
    const [owner, field, extra] = coordinate.split('.');
    const type = schema.getType(owner ?? '');
    if (
      extra ||
      !field ||
      !isObjectType(type) ||
      !Object.hasOwn(type.getFields(), field) ||
      typeof factory !== 'function'
    ) {
      throw new GraphQLFixtureError('Unknown field-factory coordinate');
    }
  }
  for (const [name, concrete] of Object.entries(abstractTypes)) {
    const type = schema.getType(name);
    if (
      !isAbstractType(type) ||
      !schema.getPossibleTypes(type).some((possible) => possible.name === concrete)
    ) {
      throw new GraphQLFixtureError('Invalid abstract-type selection');
    }
  }
  for (const [name, fixture] of Object.entries(scalars)) {
    const type = schema.getType(name);
    if (
      !isScalarType(type) ||
      ['String', 'Int', 'Float', 'Boolean', 'ID'].includes(name) ||
      typeof fixture.id !== 'string' ||
      !fixture.id ||
      ['input', 'output', 'parseInput', 'serialize', 'parseOutput'].some(
        (key) => typeof (fixture as unknown as Record<string, unknown>)[key] !== 'function'
      )
    ) {
      throw new GraphQLFixtureError(
        'Custom scalars need paired versioned generation/coercion hooks'
      );
    }
    const input = fixture.parseInput;
    const output = fixture.serialize;
    type.coerceInputValue = (value: unknown) => immediate(input(value));
    type.coerceOutputValue = (value: unknown) => immediate(output(value));
    type.coerceInputLiteral = (node) => immediate(input(valueFromASTUntyped(node)));
  }
  for (const type of Object.values(schema.getTypeMap())) {
    if (
      isScalarType(type) &&
      !['String', 'Int', 'Float', 'Boolean', 'ID'].includes(type.name) &&
      !scalars[type.name]
    ) {
      throw new GraphQLFixtureError(
        'Every custom scalar requires its native fixture/coercion hooks'
      );
    }
  }
  const schemaErrors = validateSchema(schema);
  if (schemaErrors.length) {
    throw new GraphQLFixtureError('GraphQL schema validation failed', redact(schemaErrors));
  }
  const validation = validate(
    schema,
    document,
    [...specifiedRules, NoSchemaIntrospectionCustomRule],
    { maxErrors: 20, hideSuggestions: true }
  );
  if (validation.length) {
    throw new GraphQLFixtureError('GraphQL operation validation failed', redact(validation));
  }
  const operation = getOperationAST(document, options.operationName);
  if (!operation) {
    throw new GraphQLFixtureError('Select exactly one named GraphQL operation');
  }
  visit(document, {
    Directive(node) {
      if (node.name.value !== 'skip' && node.name.value !== 'include') {
        throw new GraphQLFixtureError(
          'Executable custom/incremental directives require an explicit execution adapter'
        );
      }
    },
  });
  const variableDefinitions = operation.variableDefinitions ?? [];
  const identity = Object.freeze({
    fingerprint: JSON.stringify({ schemaText, operationText, name: options.operationName ?? '' }),
    provider: 'test-builders/graphql@17.0.2/v1',
    configuration: JSON.stringify({
      profile,
      listLength,
      maxDepth,
      maxNodes,
      scalars: Object.entries(scalars)
        .map(([name, scalar]) => [name, scalar.id])
        .sort(),
      fields: options.fieldsIdentity ?? '',
      abstractTypes,
    }),
  });
  const session = (seed: number | string = 1) => createSession({ ...identity, seed });
  const errors = (value: unknown): StandardSchemaV1.Result<Record<string, unknown>> => {
    let variables;
    try {
      variables = record(wire(value));
    } catch {
      return { issues: [{ message: 'Expected bounded variable data' }] };
    }
    const result = getVariableValues(schema, variableDefinitions, variables, {
      maxErrors: 20,
      hideSuggestions: true,
    });
    if (result.errors) {
      return { issues: redact(result.errors) };
    }
    return { value: { ...result.variableValues.coerced } };
  };
  const variableStandard: StandardSchemaV1<Record<string, unknown>, Record<string, unknown>> = {
    '~standard': { version: 1, vendor: 'test-builders/graphql', validate: errors },
  };
  const scalarValue = (
    type: GraphQLScalarType,
    execution: GenerationSession,
    output: boolean
  ): unknown => {
    const native = scalars[type.name];
    if (native) {
      const generate = output ? native.output : native.input;
      return immediate(generate(execution));
    }
    switch (type.name) {
      case 'Int':
        return profile === 'boundary'
          ? execution.pick([-2147483648, 0, 2147483647])
          : profile === 'minimal'
            ? 0
            : execution.integer(-1000, 1000);
      case 'Float':
        return profile === 'minimal' ? 0 : execution.random() * 100;
      case 'Boolean':
        return profile === 'minimal' ? false : execution.boolean();
      case 'ID':
        return String(execution.sequence('id'));
      case 'String':
        return profile === 'boundary' ? '' : `value-${execution.sequence('string')}`;
      default:
        throw new GraphQLFixtureError('Custom scalar has no fixture provider');
    }
  };
  const rawVariables = (execution: GenerationSession = session()): Record<string, unknown> => {
    let nodes = 0;
    const generate = (
      type: GraphQLInputType,
      stream: GenerationSession,
      depth: number,
      required = false
    ): unknown => {
      if (++nodes > maxNodes) {
        throw new GraphQLFixtureError('GraphQL input generation budget exhausted');
      }
      if (isNonNullType(type)) {
        return generate(type.ofType, stream, depth, true);
      }
      if (depth >= maxDepth && !(required && (isScalarType(type) || isEnumType(type)))) {
        return isListType(type) ? [] : null;
      }
      if (isListType(type)) {
        return Array.from({ length: listLength }, (_, index) =>
          generate(type.ofType, stream.scope(index), depth + 1)
        );
      }
      if (isScalarType(type)) {
        return scalarValue(type, stream, false);
      }
      if (isEnumType(type)) {
        return profile === 'minimal'
          ? type.getValues()[0]?.name
          : stream.pick(type.getValues()).name;
      }
      if (isInputObjectType(type)) {
        const entries = Object.values(type.getFields());
        const chosen = type.isOneOf
          ? [profile === 'minimal' ? entries[0]! : stream.pick(entries)]
          : entries;
        return Object.fromEntries(
          chosen
            .filter(
              (field) =>
                type.isOneOf ||
                (isNonNullType(field.type) && field.default === undefined) ||
                profile !== 'minimal'
            )
            .map((field) => [
              field.name,
              generate(field.type, stream.scope(field.name), depth + 1, type.isOneOf),
            ])
        );
      }
      throw new GraphQLFixtureError('Unsupported GraphQL input type');
    };
    const result: Record<string, unknown> = {};
    for (const definition of variableDefinitions) {
      const type = typeFromAST(schema, definition.type);
      if (!type || !isInputType(type)) {
        throw new GraphQLFixtureError('Invalid variable input type');
      }
      if (
        profile === 'minimal' &&
        (!isNonNullType(type) || definition.defaultValue !== undefined)
      ) {
        continue;
      }
      Object.defineProperty(result, definition.variable.name.value, {
        value: generate(type, execution.scope('variable', definition.variable.name.value), 0),
        enumerable: true,
      });
    }
    return result;
  };
  const createVariables = (execution: GenerationSession = session()): Record<string, unknown> => {
    const input = rawVariables(execution);
    const checked = errors(input);
    if (checked.issues) {
      throw new GraphQLFixtureError(
        'Could not create valid GraphQL variable input',
        checked.issues as readonly GraphQLFixtureIssue[]
      );
    }
    return input;
  };
  const variableBuilder = () => createSchemaBuilder(variableStandard, createVariables, options);
  const responsePath = (info: GraphQLResolveInfo) => responsePathAsArray(info.path);
  const execute = (
    variables: Record<string, unknown>,
    execution: GenerationSession,
    data?: unknown,
    validationMode = false
  ): GraphQLFixtureResult => {
    const input = record(wire(variables));
    const root = validationMode ? clone(data) : {};
    let nodes = 0;
    const choose = (type: GraphQLOutputType, stream: GenerationSession, depth: number): unknown => {
      if (++nodes > maxNodes) {
        throw new GraphQLFixtureError('GraphQL output generation budget exhausted');
      }
      if (isNonNullType(type)) {
        return choose(type.ofType, stream, depth);
      }
      if (depth > maxDepth) {
        return isListType(type) ? [] : null;
      }
      if (isListType(type)) {
        return Array.from({ length: listLength }, (_, index) =>
          choose(type.ofType, stream.scope(index), depth + 1)
        );
      }
      if (isScalarType(type)) {
        return scalarValue(type, stream, true);
      }
      if (isEnumType(type)) {
        return profile === 'minimal'
          ? type.getValues()[0]?.value
          : stream.pick(type.getValues()).value;
      }
      if (isObjectType(type)) {
        return {};
      }
      if (isAbstractType(type)) {
        return { __typename: abstractTypes[type.name] ?? schema.getPossibleTypes(type)[0]?.name };
      }
      throw new GraphQLFixtureError('Unsupported GraphQL output type');
    };
    const uncoerce = (value: unknown, type: GraphQLOutputType): unknown => {
      if (isNonNullType(type)) {
        return uncoerce(value, type.ofType);
      }
      if (value === null || value === undefined) {
        return value;
      }
      if (isListType(type)) {
        return Array.isArray(value) ? value.map((item) => uncoerce(item, type.ofType)) : value;
      }
      const scalar = isScalarType(type) ? scalars[type.name] : undefined;
      if (scalar) {
        const parse = scalar.parseOutput;
        return immediate(parse(value));
      }
      return value;
    };
    const result = executeSync({
      schema,
      document,
      ...(options.operationName ? { operationName: options.operationName } : {}),
      variableValues: input,
      rootValue: root,
      fieldResolver(parent: unknown, args, _context, info) {
        const path = responsePath(info);
        if (++nodes > maxNodes || path.length > maxDepth) {
          throw new GraphQLFixtureError('GraphQL execution budget exhausted');
        }
        if (validationMode) {
          const value = record(parent);
          const entry = Object.getOwnPropertyDescriptor(value, String(info.path.key));
          return uncoerce(entry && 'value' in entry ? entry.value : undefined, info.returnType);
        }
        const source = record(parent);
        const existing = Object.getOwnPropertyDescriptor(source, info.fieldName);
        if (existing) {
          if (!('value' in existing)) {
            throw new GraphQLFixtureError('Fixture fields must not be accessors');
          }
          return existing.value;
        }
        const coordinate = `${info.parentType.name}.${info.fieldName}`;
        const stream = execution.scope('field', ...path);
        const factory = fields[coordinate];
        return factory
          ? clone(
              immediate(
                factory(
                  Object.freeze({
                    args,
                    parent,
                    path: Object.freeze([...path]),
                    session: stream,
                    coordinate,
                  })
                )
              )
            )
          : choose(info.returnType, stream, path.length);
      },
      typeResolver(value: unknown, _context, _info, abstractType) {
        const recordValue = record(value);
        return typeof recordValue.__typename === 'string'
          ? recordValue.__typename
          : (abstractTypes[abstractType.name] ?? schema.getPossibleTypes(abstractType)[0]?.name);
      },
    });
    const output =
      result.data === undefined ? undefined : (wire(result.data) as Record<string, unknown> | null);
    return {
      ...(output === undefined ? {} : { data: output }),
      ...(result.errors ? { errors: redact(result.errors) } : {}),
    };
  };
  const response = (variables: Record<string, unknown> = {}) => {
    const inputs = record(wire(variables));
    const create = (execution: GenerationSession = session()): Record<string, unknown> => {
      const result = execute(inputs, execution);
      if (result.errors?.length || !result.data) {
        throw new GraphQLFixtureError('Could not create a valid GraphQL response', result.errors);
      }
      return clone(result.data) as Record<string, unknown>;
    };
    const inspect = (value: unknown): StandardSchemaV1.Result<Record<string, unknown>> => {
      let result;
      let data;
      try {
        data = wire(value);
        result = execute(inputs, session(), data, true);
      } catch {
        return { issues: [{ message: 'Expected bounded GraphQL response data' }] };
      }
      if (result.errors?.length) {
        return { issues: result.errors };
      }
      if (!same(data, result.data)) {
        return {
          issues: [
            { message: 'Response fields or scalar encodings differ from the selected operation' },
          ],
        };
      }
      return { value: result.data as Record<string, unknown> };
    };
    const standard: StandardSchemaV1<Record<string, unknown>> = {
      '~standard': { version: 1, vendor: 'test-builders/graphql-response', validate: inspect },
    };
    return Object.freeze({
      create,
      standard,
      check: (value: unknown) => inspect(value).issues === undefined,
      issues: (value: unknown): readonly ValidationIssue[] => inspect(value).issues ?? [],
      builder: () => createSchemaBuilder(standard, create, options),
    });
  };
  return Object.freeze({
    identity,
    session,
    metadata: Object.freeze({
      operation: operation.operation as 'query' | 'mutation' | 'subscription',
      operationName: operation.name?.value,
      network: false,
      nativeVersion: '17.0.2',
    }),
    variables: Object.freeze({
      create: createVariables,
      standard: variableStandard,
      builder: variableBuilder,
      check: (value: unknown) => errors(value).issues === undefined,
      issues: (value: unknown): readonly ValidationIssue[] => errors(value).issues ?? [],
    }),
    response,
    result(
      variables: Record<string, unknown> = {},
      execution: GenerationSession = session()
    ): GraphQLFixtureResult {
      return execute(variables, execution);
    },
  });
}
export function fromGraphQLVariables(
  schema: string,
  operation: string,
  options: GraphQLFixtureOptions = {}
): SchemaBuilder<Record<string, unknown>, Record<string, unknown>, [session?: GenerationSession]> {
  return graphqlAdapter(schema, operation, options).variables.builder();
}
export function fromGraphQLResponse(
  schema: string,
  operation: string,
  variables: Record<string, unknown> = {},
  options: GraphQLFixtureOptions = {}
): SchemaBuilder<Record<string, unknown>, Record<string, unknown>, [session?: GenerationSession]> {
  return graphqlAdapter(schema, operation, options).response(variables).builder();
}
