export class AvroFixtureError extends Error {
  readonly code = 'AVRO_FIXTURE_FAILED';
  constructor(
    message: string,
    readonly path: readonly (string | number)[] = [],
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'AvroFixtureError';
  }
}
