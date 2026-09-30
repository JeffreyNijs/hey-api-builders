import { describe, expect, it } from 'vitest';
import { Faker, en } from '@faker-js/faker';
import { generateProject, getExport } from './harness';

type RuntimeBuilder = {
  build(options?: object): Record<string, unknown>;
  buildAsync(options?: object): Promise<Record<string, unknown>>;
  describe(): { operations: readonly string[] };
  [method: string]: unknown;
};
type RuntimeConstructor = new () => RuntimeBuilder;
const seededFaker = () => {
  const faker = new Faker({ locale: [en] });
  faker.seed(42);
  return faker;
};
function callBuilderMethod(target: RuntimeBuilder, name: string, value: unknown): RuntimeBuilder {
  const method = target[name];
  if (typeof method !== 'function') {
    throw new Error(`Missing method ${name}`);
  }
  return Reflect.apply(method, target, [value]);
}
describe('canonical generated runtime', () => {
  it('imports the core instead of emitting another merge implementation', async () => {
    const openApi31 = await generateProject('openapi-3.1.json');
    try {
      expect(openApi31.buildersSource).toContain('@jeffreynijs/test-builders');
      expect(openApi31.buildersSource).not.toContain('mergeBuilderPatch');
      expect(openApi31.buildersSource).not.toContain('hasPatch');
    } finally {
      await openApi31.dispose();
    }
  });
  it('retains generated helpers after fresh overrides and async transforms', async () => {
    const openApi31 = await generateProject('openapi-3.1.json');
    try {
      const Pet = getExport<RuntimeConstructor>(openApi31.builders, 'PetBuilder');
      const base = new Pet();
      const fresh = callBuilderMethod(base, 'withFactory', () => ({ tags: ['fixture'] }));
      const named = callBuilderMethod(fresh, 'withDisplayName', 'Ada');
      const asynchronous = callBuilderMethod(
        named,
        'transformAsync',
        async (value: Record<string, unknown>) => ({ ...value, kind: 'unknown' })
      );
      const renamed = callBuilderMethod(asynchronous, 'withDisplayName2', 'Snake');
      const first = await renamed.buildAsync({ faker: seededFaker() });
      const second = await renamed.buildAsync({ faker: seededFaker() });
      expect(first.tags).not.toBe(second.tags);
      expect(first).toMatchObject({ 'display-name': 'Ada', display_name: 'Snake' });
      const validator = getExport<{ parse(value: unknown): unknown }>(openApi31.zod, 'zPet');
      expect(() => validator.parse(first)).not.toThrow();
      expect(() => renamed.build()).toThrow(/buildAsync/);
      expect(base.describe().operations).toEqual(['factory']);
    } finally {
      await openApi31.dispose();
    }
  });
  it('rejects invalid runtime module configuration before emitting imports', async () => {
    await expect(generateProject('openapi-3.1.json', { runtimeModule: '' })).rejects.toThrow();
  });
});
