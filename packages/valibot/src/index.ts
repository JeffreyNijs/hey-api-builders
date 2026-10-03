import type { GenericSchema, InferInput, InferOutput } from 'valibot';
import { toStandardJsonSchema } from '@valibot/to-json-schema';
import { fromStandardJsonSchema, jsonSchemaAdapter } from '@mimlet/json-schema';
import type { JsonSchema, JsonSchemaOptions } from '@mimlet/json-schema';
import type { StandardSchemaV1, StandardJSONSchemaV1 } from '@mimlet/core';

export type ValibotOptions = JsonSchemaOptions;

/** Native conversion adds metadata without replacing Valibot's parser or its input/output types. */
export function valibotAdapter<S extends GenericSchema>(source: S, options: ValibotOptions = {}) {
  const converted = toStandardJsonSchema(source);
  const standard: StandardSchemaV1<InferInput<S>, InferOutput<S>> &
    StandardJSONSchemaV1<InferInput<S>, InferOutput<S>> = {
    '~standard': {
      ...converted['~standard'],
      validate: (value) => source['~standard'].validate(value),
    },
  };
  let generated: ReturnType<typeof jsonSchemaAdapter> | undefined;
  // The same converted input that fromValibot generates from, so sessions and replay match.
  const generation = () =>
    (generated ??= jsonSchemaAdapter(
      standard['~standard'].jsonSchema.input({
        target: options.dialect ?? 'draft-2020-12',
      }) as JsonSchema,
      options
    ));
  return Object.freeze({
    source,
    standard,
    generation,
    metadata: Object.freeze({ vendor: 'valibot', version: '1.5.0', conversion: 'input' }),
  });
}
/** Automatic input generation; unsupported conversions throw instead of dropping constraints. */
export function fromValibot<S extends GenericSchema>(source: S, options: ValibotOptions = {}) {
  return fromStandardJsonSchema(valibotAdapter(source, options).standard, options);
}
