import type { GenericSchema, InferInput, InferOutput } from 'valibot';
import { toStandardJsonSchema } from '@valibot/to-json-schema';
import { fromStandardJsonSchema } from '@jeffreynijs/test-builders-json-schema';
import type { JsonSchemaOptions } from '@jeffreynijs/test-builders-json-schema';
import type { StandardSchemaV1, StandardJSONSchemaV1 } from '@jeffreynijs/test-builders';

/** Native conversion adds metadata without replacing Valibot's parser or its input/output types. */
export function valibotAdapter<S extends GenericSchema>(source: S) {
  const converted = toStandardJsonSchema(source);
  const standard: StandardSchemaV1<InferInput<S>, InferOutput<S>> &
    StandardJSONSchemaV1<InferInput<S>, InferOutput<S>> = {
    '~standard': {
      ...converted['~standard'],
      validate: (value) => source['~standard'].validate(value),
    },
  };
  return Object.freeze({
    source,
    standard,
    metadata: Object.freeze({ vendor: 'valibot', version: '1.5.0', conversion: 'input' }),
  });
}
/** Automatic input generation; unsupported conversions throw instead of dropping constraints. */
export function fromValibot<S extends GenericSchema>(source: S, options: JsonSchemaOptions = {}) {
  return fromStandardJsonSchema(valibotAdapter(source).standard, options);
}
