import {
  buildASTSchema,
  getOperationAST,
  isAbstractType,
  isObjectType,
  isScalarType,
  NoSchemaIntrospectionCustomRule,
  parse,
  specifiedRules,
  validate,
  validateSchema,
  valueFromASTUntyped,
  visit,
} from 'graphql';
import type { GraphQLFixtureOptions } from './types.js';
import { GraphQLFixtureError, immediate, redact } from './values.js';

/** Internal schema operations; prepared once for each native adapter. */
export function prepareGraphQLSchema({
  schemaText,
  operationText,
  options,
  maxTokens,
}: {
  schemaText: string;
  operationText: string;
  options: GraphQLFixtureOptions;
  maxTokens: number;
}) {
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
  return { schema, document, scalars, fields, abstractTypes, operation, variableDefinitions };
}
