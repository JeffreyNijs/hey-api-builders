import type { GenerationSession } from 'mimlet';
import type { GraphQLOutputType, GraphQLResolveInfo, GraphQLScalarType } from 'graphql';
import {
  executeSync,
  isAbstractType,
  isEnumType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  responsePathAsArray,
} from 'graphql';
import type {
  GraphQLFieldContext,
  GraphQLFixtureOptions,
  GraphQLFixtureResult,
  GraphQLScalarFixture,
} from './types.js';
import { GraphQLFixtureError, immediate, record, redact } from './values.js';

import type { DocumentNode, GraphQLSchema } from 'graphql';
/** Internal execution operations; prepared once for each native adapter. */
export function createGraphQLExecutor({
  schema,
  document,
  options,
  fields,
  abstractTypes,
  scalars,
  clone,
  wire,
  maxNodes,
  maxDepth,
  listLength,
  profile,
  scalarValue,
}: {
  schema: GraphQLSchema;
  document: DocumentNode;
  options: GraphQLFixtureOptions;
  fields: Readonly<Record<string, (context: GraphQLFieldContext) => unknown>>;
  abstractTypes: Readonly<Record<string, string>>;
  scalars: Readonly<Record<string, GraphQLScalarFixture>>;
  clone: (value: unknown) => unknown;
  wire: (value: unknown) => unknown;
  maxNodes: number;
  maxDepth: number;
  listLength: number;
  profile: NonNullable<GraphQLFixtureOptions['profile']>;
  scalarValue: (type: GraphQLScalarType, execution: GenerationSession, output: boolean) => unknown;
}) {
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
  return execute;
}
