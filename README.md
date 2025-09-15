# hey-api-builders

**hey-api-builders** is a custom plugin for the [Hey API](https://heyapi.dev/openapi-ts/) ecosystem that generates TypeScript builder classes for mock data based on your OpenAPI schemas. By leveraging [JSON Schema Faker](https://github.com/json-schema-faker/json-schema-faker) or [Zod](https://zod.dev/), this plugin automates the creation of flexible mock data builders, making testing and prototyping easier.

## Features

- **Builder Pattern for Mock Data:** Generates a TypeScript builder class for each OpenAPI schema, allowing you to override specific fields and generate mock objects.
- **Zod Integration:** Generate Zod schemas with proper format validation (UUID, email, etc.) for enhanced type safety and validation.
- **Format-Aware Validation:** Handles OpenAPI formats like `uuid`, `email`, `date-time`, and more with appropriate Zod validators.
- **Automatic Reference Resolution:** Handles `$ref` and schema composition, so your builders reflect your OpenAPI definitions accurately.
- **Seamless Integration:** Designed to work with Hey API's plugin system and TypeScript type generation.
- **Configurable Output:** Choose between JSON Schema Faker or Zod for mock generation.

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
- **output** (string): Output filename (without extension) for the generated builders. Default: `'builders'`.

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
