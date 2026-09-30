import type { GraphQLFixtureIssue } from './types.js';
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
