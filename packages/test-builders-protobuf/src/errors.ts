export class ProtobufFixtureError extends Error {
  readonly code = 'PROTOBUF_FIXTURE_FAILED';
  constructor(
    message: string,
    readonly path: readonly (string | number)[] = [],
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'ProtobufFixtureError';
  }
}
