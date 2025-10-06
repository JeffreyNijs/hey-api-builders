# hey-api-builders

[![CI](https://github.com/JeffreyNijs/hey-api-builders/actions/workflows/ci.yml/badge.svg)](https://github.com/JeffreyNijs/hey-api-builders/actions/workflows/ci.yml)
[![Code Quality](https://github.com/JeffreyNijs/hey-api-builders/actions/workflows/code-quality.yml/badge.svg)](https://github.com/JeffreyNijs/hey-api-builders/actions/workflows/code-quality.yml)
[![npm version](https://badge.fury.io/js/hey-api-builders.svg)](https://badge.fury.io/js/hey-api-builders)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**hey-api-builders** is a custom plugin for the [Hey API](https://heyapi.dev/openapi-ts/) ecosystem that generates TypeScript builder classes for mock data based on your OpenAPI schemas. With a fully custom lightweight mock generator, [Zod](https://zod.dev/) integration, or static mock generation, this plugin automates the creation of flexible mock data builders, making testing and prototyping easier.

## Features

- **Builder Pattern for Mock Data:** Generates a TypeScript builder class for each OpenAPI schema, allowing you to override specific fields and generate mock objects.
- **Multiple Mock Generation Strategies:**
  - **Custom Runtime** (default): Lightweight, dependency-free mock generation with full JSON Schema support
  - **Zod Integration:** Generate Zod schemas with proper format validation (UUID, email, etc.) for enhanced type safety and validation
  - **Static Mocks:** Generate hardcoded mock values without runtime dependencies for ultra-fast mock generation
- **Format-Aware Generation:** Handles OpenAPI formats like `uuid`, `email`, `date-time`, and more with appropriate mock values.
- **Automatic Reference Resolution:** Handles `$ref` and schema composition, so your builders reflect your OpenAPI definitions accurately.
- **Seamless Integration:** Designed to work with Hey API's plugin system and TypeScript type generation.
- **Zero External Dependencies:** No need for faker.js or other heavy dependencies - the custom runtime is lightweight and fast.
- **Flexible Configuration:** Choose between custom runtime, Zod, or static mock generation using a simple `mockStrategy` option.

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
      // Optional: Mock generation strategy (default: 'runtime')
      // Options: 'runtime' | 'zod' | 'static'
      mockStrategy: 'runtime',
      // Optional: Custom identifier for builder class names
      // Useful when generating multiple builder sets
      builderIdentifier: '',
      // Optional: Custom output filename
      output: 'builders.gen.ts'
    }),
  ],
});
```

### Configuration Options

- **generateZod** (boolean): Generate Zod schemas alongside builders for validation. Default: `false`.
- **mockStrategy** (string): Strategy for generating mock data. Default: `'runtime'`.
  - `'runtime'`: Use custom lightweight runtime mock generation
  - `'zod'`: Use Zod for mock generation
  - `'static'`: Generate static mock builders without runtime dependencies
- **builderIdentifier** (string): Custom identifier to add to builder class names. Useful when generating multiple builder sets with different strategies in the same project. Default: `undefined` (no identifier).
  - Example: With `builderIdentifier: 'Static'`, generates `UserStaticBuilder` instead of `UserBuilder`
- **output** (string): Output filename (without extension) for the generated builders. Default: `'builders'`.

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

### Using Multiple Builder Sets

You can generate multiple builder sets with different strategies in the same project by using the `builderIdentifier` option:

```typescript
// openapi.config.ts
export default defineConfig({
  input: 'path/to/your/openapi.yaml',
  output: 'src/client',
  plugins: [
    // Generate static builders
    defineBuildersConfig({
      mockStrategy: 'static',
      builderIdentifier: 'Static',
      output: 'builders-static',
    }),
    // Generate runtime builders
    defineBuildersConfig({
      mockStrategy: 'runtime',
      builderIdentifier: 'Runtime',
      output: 'builders-runtime',
    }),
  ],
});
```

This generates distinct builder classes that can coexist:

```typescript
import { UserStaticBuilder } from './client/builders-static';
import { UserRuntimeBuilder } from './client/builders-runtime';

// Use static builders for predictable test data
const staticUser = new UserStaticBuilder()
  .withName('Test User')
  .build();

// Use runtime builders for varied test data
const runtimeUser = new UserRuntimeBuilder()
  .withName('Random User')
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

## Mock Generation Strategies

### Custom Runtime (Default)

The default strategy uses a lightweight custom mock generator that supports all JSON Schema features without external dependencies. This provides fast, predictable mock data generation.

```typescript
// Configuration
defineBuildersConfig({
  mockStrategy: 'runtime', // or omit for default
})

// Usage
import { UserBuilder } from './client/builders';

const user = new UserBuilder()
  .withName('Alice')
  .build(); // Generates schema-compliant data for other fields
```

Features:
- **Zero dependencies** - No external libraries required
- **Full JSON Schema support** - Handles all types, formats, and constraints
- **Format-aware** - Generates appropriate values for UUIDs, emails, dates, etc.
- **Lightweight** - Small bundle size
- **Fast** - Optimized for performance

### Static Mocks

When `mockStrategy: 'static'` is configured, the plugin generates hardcoded mock values directly in the builder classes. This approach:

- **No runtime generation** - All values are pre-computed at build time
- **Predictable values** - generates consistent, type-appropriate default values
- **Ultra-lightweight** - No runtime code at all
- **Maximum performance** - Zero overhead

```typescript
// Configuration
defineBuildersConfig({
  mockStrategy: 'static',
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

When `mockStrategy: 'zod'` is configured, mock generation uses Zod schemas. This is experimental and provides runtime validation.

```typescript
// Configuration
defineBuildersConfig({
  mockStrategy: 'zod',
})

// Usage
const user = new UserBuilder()
  .withName('Alice')
  .build(); // Uses Zod for mock generation
```

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
  - A `build()` method that generates a mock object using the custom runtime, Zod, or static values, applying any overrides you set.
- When `generateZod: true`, Zod schemas are generated with proper format validation.
- Format-specific generation ensures UUIDs, emails, dates, etc. have appropriate mock values.
- The custom runtime supports all JSON Schema features including nested objects, arrays, enums, and unions.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on the [GitHub repository](https://github.com/JeffreyNijs/hey-api-builders).

## License

MIT License. See [LICENSE](./LICENSE) for details.

---

By integrating **hey-api-builders** into your workflow, you can quickly generate and customize mock data for testing and development, all strongly typed and validated based on your OpenAPI schemas.
