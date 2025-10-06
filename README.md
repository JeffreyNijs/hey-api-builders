# hey-api-builders

[![CI](https://github.com/JeffreyNijs/hey-api-builders/actions/workflows/ci.yml/badge.svg)](https://github.com/JeffreyNijs/hey-api-builders/actions/workflows/ci.yml)
[![Code Quality](https://github.com/JeffreyNijs/hey-api-builders/actions/workflows/code-quality.yml/badge.svg)](https://github.com/JeffreyNijs/hey-api-builders/actions/workflows/code-quality.yml)
[![npm version](https://badge.fury.io/js/hey-api-builders.svg)](https://badge.fury.io/js/hey-api-builders)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**hey-api-builders** is a custom plugin for the [Hey API](https://heyapi.dev/openapi-ts/) ecosystem that generates TypeScript builder classes for mock data based on your OpenAPI schemas. By leveraging [JSON Schema Faker](https://github.com/json-schema-faker/json-schema-faker), [Zod](https://zod.dev/), or static mock generation, this plugin automates the creation of flexible mock data builders, making testing and prototyping easier.

## Features

- **Builder Pattern for Mock Data:** Generates a TypeScript builder class for each OpenAPI schema, allowing you to override specific fields and generate mock objects.
- **Multiple Mock Generation Strategies:**
  - **JSON Schema Faker** (default): Dynamic mock generation with full faker.js support
  - **Zod Integration:** Generate Zod schemas with proper format validation (UUID, email, etc.) for enhanced type safety and validation
  - **Static Mocks:** Generate hardcoded mock values without runtime dependencies for lightweight, fast mock generation
- **Format-Aware Validation:** Handles OpenAPI formats like `uuid`, `email`, `date-time`, and more with appropriate validators.
- **Automatic Reference Resolution:** Handles `$ref` and schema composition, so your builders reflect your OpenAPI definitions accurately.
- **Seamless Integration:** Designed to work with Hey API's plugin system and TypeScript type generation.
- **Configurable Output:** Choose between JSON Schema Faker, Zod, or static mock generation.

## Installation

Add **hey-api-builders** to your project:

```bash
npm install hey-api-builders
```

For Zod support, also install Zod:

```bash
npm install zod
```

Or with Yarn:

```bash
yarn add hey-api-builders zod
```

## Configuration

In your `openapi.config.ts`, register the plugin:

```typescript
import { defineConfig } from '@hey-api/openapi-ts';
import { defineConfig as defineBuildersConfig } from 'hey-api-builders';

export default defineConfig({
  input: 'path/to/your/openapi.yaml',
  output: 'src/client',
  plugins: [
    // ...other plugins
    defineBuildersConfig({
      // Optional: Generate Zod schemas for validation
      generateZod: true,
      // Optional: Use Zod for mock generation (requires zod-mock library)
      useZodForMocks: false,
      // Optional: Use static mock generation (no runtime dependencies)
      useStaticMocks: false,
      // Optional: Custom output filename
      output: 'builders.gen.ts'
    }),
  ],
});
```

## Usage

After running the Hey API code generation, you'll get a file containing builder classes for each schema.

### Basic Usage

```typescript
import { UserBuilder } from './client/builders';

const user = new UserBuilder()
  .withName('Alice')
  .withEmail('alice@example.com')
  .withId('123e4567-e89b-12d3-a456-426614174000') // UUID format validated
  .build();
```

### Using Zod Schemas

When `generateZod: true` is enabled, you also get Zod schemas for validation:

```typescript
import { zodSchemas } from './client/builders';

// Validate data against schema
const result = zodSchemas.UserSchemaZod.safeParse(userData);
if (result.success) {
  console.log('Valid user:', result.data);
} else {
  console.log('Validation errors:', result.error.issues);
}
```

## Configuration Options

- **generateZod** (boolean): Generate Zod schemas alongside builders for validation. Default: `false`.
- **useZodForMocks** (boolean): Use Zod for mock generation instead of JSON Schema Faker. Default: `false` (experimental).
- **useStaticMocks** (boolean): Generate static mock builders without runtime dependencies. When enabled, generates hardcoded mock values based on schema types instead of using JSON Schema Faker or Zod at runtime. Default: `false`.
- **output** (string): Output filename (without extension) for the generated builders. Default: `'builders'`.

## Mock Generation Strategies

### JSON Schema Faker (Default)

The default strategy uses JSON Schema Faker to generate dynamic, randomized mock data at runtime. This provides the most flexibility and variety in generated data.

```typescript
import { UserBuilder } from './client/builders';

const user = new UserBuilder()
  .withName('Alice')
  .build(); // Generates random data for other fields
```

### Static Mocks

When `useStaticMocks: true` is enabled, the plugin generates hardcoded mock values directly in the builder classes. This approach:

- **No runtime dependencies** - doesn't require JSON Schema Faker or faker.js
- **Predictable values** - generates consistent, type-appropriate default values
- **Lightweight** - smaller bundle size
- **Fast** - no runtime mock generation overhead

```typescript
// Configuration
defineBuildersConfig({
  useStaticMocks: true,
})

// Usage - same API, but mocks are statically generated
const user = new UserBuilder()
  .withEmail('custom@example.com')
  .build(); // Returns predefined values for other fields
```

Static mocks generate appropriate defaults based on OpenAPI types and formats:
- UUIDs: `"550e8400-e29b-41d4-a716-446655440000"`
- Emails: `"user@example.com"`
- URLs: `"https://example.com"`
- Dates: `"2024-01-01"`
- DateTime: `"2024-01-01T00:00:00.000Z"`
- Strings: Length-appropriate placeholder strings
- Numbers: Midpoint of min/max range or sensible defaults

### Zod Integration

When `useZodForMocks: true` is enabled, mock generation uses Zod schemas. This is experimental and provides runtime validation.

## Format Support

The Zod generator properly handles OpenAPI formats:

- `uuid`: `.uuid()` validation
- `email`: `.email()` validation  
- `uri`/`url`: `.url()` validation
- `date`: `.date()` validation
- `date-time`: `.datetime()` validation
- `phone`: Custom regex validation for phone numbers

Example schema with UUID format:
```yaml
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
          format: uuid  # Generates z.string().uuid()
        email:
          type: string
          format: email # Generates z.string().email()
```

## Builder Options

Each builder supports options to customize mock generation:

```typescript
const user = new UserBuilder()
  .setOptions({
    useDefault: true,           // Use default values from schema
    useExamples: true,          // Use example values from schema
    alwaysIncludeOptionals: false, // Include optional fields
    optionalsProbability: 0.8,  // Probability of including optionals
    omitNulls: true            // Omit null values
  })
  .withName('Alice')
  .build();
```

## How It Works

- For each schema, a builder class is generated with:
  - `with<Property>(value)` methods for each property.
  - A `build()` method that generates a mock object using JSON Schema Faker or Zod, applying any overrides you set.
- When `generateZod: true`, Zod schemas are generated with proper format validation.
- Format-specific validations ensure UUIDs are valid UUIDs, emails are valid emails, etc.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on the [GitHub repository](https://github.com/JeffreyNijs/hey-api-builders).

## License

MIT License. See [LICENSE](./LICENSE) for details.

---

By integrating **hey-api-builders** into your workflow, you can quickly generate and customize mock data for testing and development, all strongly typed and validated based on your OpenAPI schemas.
