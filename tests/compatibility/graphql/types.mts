import {
  graphqlAdapter,
  fromGraphQLVariables,
  fromGraphQLResponse,
  type GraphQLFixtureResult,
  type GraphQLScalarFixture,
} from '@jeffreynijs/test-builders-graphql';
import type { SchemaBuilder, GenerationSession } from '@jeffreynijs/test-builders';
declare function expectType<T>(value: T): void;
const variables = fromGraphQLVariables('type Query{x:Int}', '{x}');
expectType<
  SchemaBuilder<Record<string, unknown>, Record<string, unknown>, [session?: GenerationSession]>
>(variables);
expectType<GraphQLFixtureResult>(graphqlAdapter('type Query{x:Int}', '{x}').result());
expectType<Record<string, unknown>>(
  fromGraphQLResponse('type Query{x:Int}', '{x}').buildValidated()
);
// @ts-expect-error Runtime SDL cannot infer an application model type.
const id: string = variables.build().id;
// @ts-expect-error Known async transformations lose synchronous build operations.
variables.transformAsync(async (v) => v).buildValidated();
// @ts-expect-error Schemas are SDL data, not live resolver-bearing objects.
graphqlAdapter({}, '{x}');
// @ts-expect-error Scalars require both input and output coercion boundaries.
const scalar: GraphQLScalarFixture = { id: 'v1', input: () => 1, output: () => 1 };
void id;
void scalar;
