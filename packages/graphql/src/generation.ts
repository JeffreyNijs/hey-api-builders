import type { GenerationSession, StandardSchemaV1 } from 'mimlet';
import type { GraphQLInputType, GraphQLScalarType } from 'graphql';
import {
  isEnumType,
  isInputObjectType,
  isInputType,
  isListType,
  isNonNullType,
  isScalarType,
  typeFromAST,
} from 'graphql';
import type { GraphQLFixtureIssue, GraphQLFixtureOptions, GraphQLScalarFixture } from './types.js';
import { GraphQLFixtureError, immediate } from './values.js';

import type { GraphQLSchema, VariableDefinitionNode } from 'graphql';
/** Internal generation operations; prepared once for each native adapter. */
export function createGraphQLGenerators({
  schema,
  variableDefinitions,
  scalars,
  profile,
  listLength,
  maxDepth,
  maxNodes,
  session,
  errors,
}: {
  schema: GraphQLSchema;
  variableDefinitions: readonly VariableDefinitionNode[];
  scalars: Readonly<Record<string, GraphQLScalarFixture>>;
  profile: NonNullable<GraphQLFixtureOptions['profile']>;
  listLength: number;
  maxDepth: number;
  maxNodes: number;
  session: (seed?: string | number) => GenerationSession;
  errors: (value: unknown) => StandardSchemaV1.Result<Record<string, unknown>>;
}) {
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
  return { scalarValue, createVariables };
}
