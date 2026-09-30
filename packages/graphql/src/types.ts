import type { GenerationSession, SchemaBuilderConfig } from '@mimlet/core';
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
