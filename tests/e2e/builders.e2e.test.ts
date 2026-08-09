import { Faker, en } from '@faker-js/faker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generateProject, getExport, type BuildersConfig, type GeneratedProject } from './harness';

type BuilderOptions = {
  faker?: Faker;
  includeOptional?: boolean | number;
  useDefault?: boolean | number;
};

type RuntimeBuilder<T = unknown> = {
  build: (options?: BuilderOptions) => T;
  buildList: (count: number, options?: BuilderOptions) => Array<T>;
  transform: (transformer: (value: T) => T) => RuntimeBuilder<T>;
  with: (patch: unknown) => RuntimeBuilder<T>;
  [method: string]: unknown;
};

type RuntimeBuilderConstructor<T = unknown> = new (initial?: unknown) => RuntimeBuilder<T>;

type RuntimeSchema<T = unknown> = {
  parse: (value: unknown) => T;
};

const projects: Array<GeneratedProject> = [];
let openApi31: GeneratedProject;
let openApi30: GeneratedProject;
let swagger20: GeneratedProject;

function seededFaker(): Faker {
  const instance = new Faker({ locale: [en] });
  instance.seed(42);
  instance.setDefaultRefDate('2026-01-01T00:00:00.000Z');
  return instance;
}

function builder<T = Record<string, unknown>>(
  project: GeneratedProject,
  ...names: ReadonlyArray<string>
): RuntimeBuilderConstructor<T> {
  return getExport<RuntimeBuilderConstructor<T>>(project.builders, ...names);
}

function schema<T = unknown>(
  project: GeneratedProject,
  ...names: ReadonlyArray<string>
): RuntimeSchema<T> {
  return getExport<RuntimeSchema<T>>(project.zod, ...names);
}

function expectSchemaAccepts(project: GeneratedProject, schemaName: string, value: unknown): void {
  expect(() => schema(project, schemaName).parse(value)).not.toThrow();
}

function callBuilderMethod<T>(
  target: RuntimeBuilder<T>,
  method: string,
  value: unknown
): RuntimeBuilder<T> {
  const candidate = target[method];
  if (typeof candidate !== 'function') {
    throw new Error(
      `Expected ${method}() on builder. Available: ${Object.getOwnPropertyNames(
        Object.getPrototypeOf(target) as object
      ).join(', ')}`
    );
  }
  return candidate.call(target, value) as RuntimeBuilder<T>;
}

async function generateConfiguredProject(config: BuildersConfig): Promise<GeneratedProject> {
  const project = await generateProject('openapi-3.1.json', config);
  projects.push(project);
  return project;
}

beforeAll(async () => {
  for (const fixture of ['openapi-3.1.json', 'openapi-3.0.json', 'swagger-2.0.json']) {
    const project = await generateProject(fixture);
    projects.push(project);
  }
  [openApi31, openApi30, swagger20] = projects as [
    GeneratedProject,
    GeneratedProject,
    GeneratedProject,
  ];
});

afterAll(async () => {
  await Promise.all(projects.map((project) => project.dispose()));
});

describe('real Hey API generation', () => {
  it('generates, type-checks, emits, and loads the complete plugin stack', () => {
    for (const project of projects) {
      expect(project.generatedFiles).toContain('types.gen.ts');
      expect(project.generatedFiles.some((file) => file.endsWith('faker.gen.ts'))).toBe(true);
      expect(project.generatedFiles).toContain('zod.gen.ts');
      expect(project.buildersSource).toMatch(/faker\.gen/);
      expect(Object.keys(project.builders).some((name) => name.endsWith('Builder'))).toBe(true);
      expect(Object.keys(project.faker).length).toBeGreaterThan(0);
      expect(Object.keys(project.zod).length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['OpenAPI 3.1', () => openApi31, 'PetBuilder', 'zPet'],
    ['OpenAPI 3.0', () => openApi30, 'ProfileBuilder', 'zProfile'],
    ['Swagger 2.0', () => swagger20, 'LegacyPetBuilder', 'zLegacyPet'],
  ])('supports %s definitions', (_label, projectValue, builderName, schemaName) => {
    const project = projectValue();
    const Builder = builder(project, builderName);
    const value = new Builder().build({ faker: seededFaker() });
    expectSchemaAccepts(project, schemaName, value);
  });
});

describe('public plugin configuration', () => {
  it('coerces each false category toggle without disabling the other categories', async () => {
    const noDefinitions = await generateConfiguredProject({ definitions: false });
    expect(noDefinitions.builders).not.toHaveProperty('PetBuilder');
    expect(noDefinitions.builders).toHaveProperty('GetPetRequestBuilder');
    expect(noDefinitions.builders).toHaveProperty('GetPetResponse200Builder');

    const noRequests = await generateConfiguredProject({ requests: false });
    expect(noRequests.builders).toHaveProperty('PetBuilder');
    expect(noRequests.builders).not.toHaveProperty('GetPetRequestBuilder');
    expect(noRequests.builders).toHaveProperty('GetPetResponse200Builder');

    const noResponses = await generateConfiguredProject({ responses: false });
    expect(noResponses.builders).toHaveProperty('PetBuilder');
    expect(noResponses.builders).toHaveProperty('GetPetRequestBuilder');
    expect(noResponses.builders).not.toHaveProperty('GetPetResponse200Builder');
    expect(noResponses.builders).not.toHaveProperty('GetPetResponse404Builder');
  });

  it('coerces category name functions/templates and honors includeInEntry: false', async () => {
    const custom = await generateConfiguredProject({
      definitions: (name) => `fixture_${name}`,
      includeInEntry: false,
      requests: 'request_{{name}}_fixture',
      responses: {
        name: (name) => `response_${name}_fixture`,
      },
    });

    expect(custom.builders).toHaveProperty('FixturePet');
    expect(custom.builders).toHaveProperty('RequestGetPetRequestFixture');
    expect(custom.builders).toHaveProperty('ResponseGetPetResponse200Fixture');
    expect(custom.builders).toHaveProperty('ResponseGetPetResponse404Fixture');
    expect(custom.builders).not.toHaveProperty('PetBuilder');
    expect(custom.indexSource).not.toMatch(/hey-api-builders\.gen/);
  });
});

describe('immutable definition builders', () => {
  it('supports constructor patches, with(), generated with-property methods, and transform()', () => {
    const PetBuilder = builder<Record<string, unknown>>(openApi31, 'PetBuilder');
    const initial = new PetBuilder({
      'display-name': 'Initial name',
      '2fa_enabled': true,
      attributes: { source: 'constructor' },
      tags: ['constructor'],
    });
    const patched = initial.with({
      attributes: { source: 'with' },
      nickname: null,
      tags: ['e2e'],
    });
    const named = callBuilderMethod(patched, 'withDisplayName', 'Ada Lovelace');
    const collisionNamed = callBuilderMethod(named, 'withDisplayName2', 'Snake Case Name');
    const transformed = collisionNamed.transform((pet) => ({
      ...pet,
      'display-name': String(pet['display-name']).toUpperCase(),
    }));

    expect(patched).not.toBe(initial);
    expect(named).not.toBe(patched);
    expect(collisionNamed).not.toBe(named);
    expect(transformed).not.toBe(collisionNamed);

    const value = transformed.build({
      faker: seededFaker(),
      includeOptional: true,
      useDefault: true,
    });
    expect(value).toMatchObject({
      'display-name': 'ADA LOVELACE',
      '2fa_enabled': true,
      attributes: { source: 'with' },
      display_name: 'Snake Case Name',
      kind: 'unknown',
      nickname: null,
      tags: ['e2e'],
    });
    expectSchemaAccepts(openApi31, 'zPet', value);

    const originalValue = initial.build({ faker: seededFaker() });
    expect(originalValue['display-name']).toBe('Initial name');
    expect(originalValue.attributes).toEqual({ source: 'constructor' });
  });

  it('buildList() applies the same patches and transformations to every new value', () => {
    const PetBuilder = builder<Record<string, unknown>>(openApi31, 'PetBuilder');
    const configured = new PetBuilder()
      .with({ tags: ['list'], attributes: { suite: 'e2e' } })
      .transform((pet) => ({ ...pet, 'display-name': 'LIST PET' }));

    const values = configured.buildList(4, {
      faker: seededFaker(),
      includeOptional: false,
    });

    expect(values).toHaveLength(4);
    for (const value of values) {
      expect(value).toMatchObject({
        'display-name': 'LIST PET',
        attributes: { suite: 'e2e' },
        tags: ['list'],
      });
      expectSchemaAccepts(openApi31, 'zPet', value);
    }
  });

  it('handles zero-sized lists and rejects counts that cannot be allocated safely', () => {
    const PetBuilder = builder<Record<string, unknown>>(openApi31, 'PetBuilder');
    const target = new PetBuilder();

    expect(target.buildList(0)).toEqual([]);

    for (const count of [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => target.buildList(count)).toThrow(RangeError);
    }
  });

  it('forwards default, optional-property, and custom Faker options unchanged', () => {
    const PetBuilder = builder<Record<string, unknown>>(openApi31, 'PetBuilder');
    const withoutOptionals = new PetBuilder().build({
      faker: seededFaker(),
      includeOptional: false,
      useDefault: true,
    });

    expect(withoutOptionals.kind).toBe('unknown');
    expect(Object.hasOwn(withoutOptionals, 'nickname')).toBe(false);

    const first = new PetBuilder().build({
      faker: seededFaker(),
      includeOptional: true,
    });
    const second = new PetBuilder().build({
      faker: seededFaker(),
      includeOptional: true,
    });
    expect(first).toEqual(second);
  });
});

describe('schema edge cases', () => {
  it('builds arrays, maps, nullable values, defaults, and enums accepted by official Zod', () => {
    const PetBuilder = builder<Record<string, unknown>>(openApi31, 'PetBuilder');
    const StatusBuilder = builder<string>(openApi31, 'StatusBuilder');
    const pet = new PetBuilder()
      .with({
        attributes: { environment: 'test', owner: 'Codex' },
        nickname: null,
        tags: ['typed', 'generated'],
      })
      .build({ faker: seededFaker(), useDefault: true });
    const status = new StatusBuilder().build({ faker: seededFaker() });

    expect(pet.tags).toEqual(['typed', 'generated']);
    expect(pet.attributes).toEqual({ environment: 'test', owner: 'Codex' });
    expect(pet.nickname).toBeNull();
    expect(pet.kind).toBe('unknown');
    expectSchemaAccepts(openApi31, 'zPet', pet);
    expectSchemaAccepts(openApi31, 'zStatus', status);
  });

  it('uses Hey API conflict-resolved symbols for reserved and colliding Error schemas', () => {
    const errorBuilderNames = Object.keys(openApi31.builders).filter((name) =>
      /^_*Error.*Builder.*$/.test(name)
    );
    expect(errorBuilderNames).toHaveLength(2);

    const values = errorBuilderNames.map((name) => {
      const ErrorBuilder = builder<Record<string, unknown>>(openApi31, name);
      return new ErrorBuilder().build({ faker: seededFaker() });
    });

    expect(values.some((value) => 'code' in value && 'message' in value)).toBe(true);
    expect(values.some((value) => 'reason' in value)).toBe(true);
  });

  it.each([
    ['allOf', 'DetailedPetBuilder', 'zDetailedPet'],
    ['oneOf', 'AnimalBuilder', 'zAnimal'],
  ])('builds %s compositions', (_kind, builderName, schemaName) => {
    const Builder = builder(openApi31, builderName);
    const value = new Builder().build({ faker: seededFaker(), includeOptional: true });
    expectSchemaAccepts(openApi31, schemaName, value);
  });

  it('terminates circular references and produces a Zod-valid tree', () => {
    const TreeNodeBuilder = builder<Record<string, unknown>>(openApi31, 'TreeNodeBuilder');
    const tree = new TreeNodeBuilder().build({
      faker: seededFaker(),
      includeOptional: true,
    });

    expect(() => JSON.stringify(tree)).not.toThrow();
    expectSchemaAccepts(openApi31, 'zTreeNode', tree);
  });

  it('normalizes generated methods for snake_case and other odd property names', () => {
    const ProfileBuilder = builder<Record<string, unknown>>(openApi30, 'ProfileBuilder');
    const LegacyPetBuilder = builder<Record<string, unknown>>(swagger20, 'LegacyPetBuilder');
    const profile = callBuilderMethod(
      new ProfileBuilder().with({ settings: { alerts: true } }),
      'withDisplayName',
      null
    ).build({ faker: seededFaker(), useDefault: true });
    const legacyPet = callBuilderMethod(new LegacyPetBuilder(), 'withName', 'Old Rover').build({
      faker: seededFaker(),
    });

    expect(profile.display_name).toBeNull();
    expect(profile.locale).toBe('en-BE');
    expectSchemaAccepts(openApi30, 'zProfile', profile);
    expect(legacyPet.name).toBe('Old Rover');
    expectSchemaAccepts(swagger20, 'zLegacyPet', legacyPet);
  });
});

describe('operation builders', () => {
  it('builds combined request data and status-specific success/error responses', () => {
    const GetPetRequestBuilder = builder<Record<string, unknown>>(
      openApi31,
      'GetPetRequestBuilder'
    );
    const GetPetResponse200Builder = builder<Record<string, unknown>>(
      openApi31,
      'GetPetResponse200Builder'
    );
    const GetPetResponse404Builder = builder<Record<string, unknown>>(
      openApi31,
      'GetPetResponse404Builder'
    );

    const request = new GetPetRequestBuilder().build({
      faker: seededFaker(),
      includeOptional: true,
      useDefault: true,
    });
    const success = new GetPetResponse200Builder().build({ faker: seededFaker() });
    const notFound = new GetPetResponse404Builder().build({ faker: seededFaker() });

    expect(request).toMatchObject({
      path: { id: expect.any(String) },
      query: { 'include-history': false },
    });
    expectSchemaAccepts(openApi31, 'zPet', success);
    expect(notFound).toEqual(
      expect.objectContaining({
        code: expect.any(String),
        message: expect.any(String),
      })
    );
  });

  it('builds array and scalar responses without inventing element-property helpers', () => {
    const ListPetsResponseBuilder = builder<Array<Record<string, unknown>>>(
      openApi31,
      'ListPetsResponse200Builder'
    );
    const GetHealthResponseBuilder = builder<string>(openApi31, 'GetHealthResponse200Builder');
    const listBuilder = new ListPetsResponseBuilder();

    expect(listBuilder.withDisplayName).toBeUndefined();
    const pets = listBuilder.build({ faker: seededFaker() });
    expect(pets.length).toBeGreaterThanOrEqual(1);
    for (const pet of pets) {
      expectSchemaAccepts(openApi31, 'zPet', pet);
    }

    const healthBuilder = new GetHealthResponseBuilder();
    expect(healthBuilder.withValue).toBeUndefined();
    expect(healthBuilder.with('ok').build({ faker: seededFaker() })).toBe('ok');
  });
});
