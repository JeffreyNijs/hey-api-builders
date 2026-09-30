import { createSchemaBuilder } from '@jeffreynijs/test-builders';
import type { StandardSchemaV1 } from '@jeffreynijs/test-builders';
import type { AdapterInspection } from './index.js';

export interface ConformanceCase {
  readonly name: string;
  /** Fresh input per assertion, including native values that cannot be JSON-cloned. */
  readonly input: () => unknown;
  readonly valid: boolean;
  /** Compare transformed output using application/native equality, not stringification. */
  readonly output?: (value: unknown) => boolean;
}
export interface ConformanceSubject {
  readonly standard: StandardSchemaV1;
  /** Other capabilities are opaque; adapters need not implement a pure input check. */
  readonly operations: {
    readonly checkInput?: (value: unknown) => boolean;
    readonly [capability: string]: unknown;
  };
  inspect(): AdapterInspection;
}
export interface ConformanceResult {
  readonly adapter: string;
  readonly passed: boolean;
  readonly cases: readonly {
    readonly name: string;
    readonly passed: boolean;
    readonly reason?: string;
  }[];
}
/** Test helper: invokes trusted fixtures/validators explicitly. Inspection itself never executes them. */
export async function checkAdapterConformance(
  subject: ConformanceSubject,
  cases: readonly ConformanceCase[]
): Promise<ConformanceResult> {
  const operations = subject.operations;
  if (!Array.isArray(cases) || !cases.length || cases.length > 10_000) {
    throw new TypeError('Conformance needs 1 to 10000 cases');
  }
  const names = new Set<string>();
  for (const item of cases) {
    if (
      !item ||
      typeof item.name !== 'string' ||
      !item.name ||
      item.name.length > 256 ||
      names.has(item.name) ||
      typeof item.input !== 'function' ||
      typeof item.valid !== 'boolean' ||
      (item.output !== undefined && typeof item.output !== 'function')
    ) {
      throw new TypeError('Invalid or duplicate conformance case');
    }
    names.add(item.name);
  }
  const results = [];
  for (const item of cases) {
    let reason: string | undefined;
    try {
      if (operations.checkInput && operations.checkInput(item.input()) !== item.valid) {
        reason = 'Native input check disagrees with the expected validity';
      } else {
        let calls = 0;
        const standard: StandardSchemaV1 = {
          '~standard': {
            version: 1,
            vendor: 'conformance',
            validate(value, options) {
              calls++;
              return subject.standard['~standard'].validate(value, options);
            },
          },
        };
        const builder = createSchemaBuilder(standard, item.input);
        await builder.buildAsync();
        if (calls !== 0) {
          throw new Error('Unchecked build invoked validation');
        }
        const raw = item.input();
        const parsed = await subject.standard['~standard'].validate(raw);
        const valid = parsed.issues === undefined;
        if (valid !== item.valid) {
          reason = 'Standard validation disagrees with the expected validity';
        } else if (valid && item.output && !item.output(parsed.value)) {
          reason = 'Parsed output disagrees with the expected output';
        } else {
          let failure = false;
          try {
            const output = await builder.buildValidatedAsync();
            if (item.output && !item.output(output)) {
              reason = 'Builder output differs from the expected parsed output';
            }
          } catch {
            failure = true;
          }
          if (failure === item.valid) {
            reason = 'Validated builder disagrees with the expected validity';
          }
          if (Number(calls) !== 1) {
            reason = 'Validated builder must invoke Standard Schema exactly once';
          }
        }
      }
    } catch {
      reason = 'Conformance fixture or validator threw unexpectedly';
    }
    results.push(
      Object.freeze({
        name: item.name,
        passed: reason === undefined,
        ...(reason ? { reason } : {}),
      })
    );
  }
  return Object.freeze({
    adapter: subject.inspect().id,
    passed: results.every((result) => result.passed),
    cases: Object.freeze(results),
  });
}
export async function assertAdapterConformance(
  subject: ConformanceSubject,
  cases: readonly ConformanceCase[]
): Promise<void> {
  const result = await checkAdapterConformance(subject, cases);
  if (!result.passed) {
    throw new Error(
      `Adapter conformance failed: ${result.cases
        .filter((item) => !item.passed)
        .map((item) => item.name)
        .join(', ')}`
    );
  }
}
