# hey-api-builders

**hey-api-builders** is a custom plugin for the [Hey API](https://heyapi.dev/openapi-ts/) ecosystem that generates TypeScript builder classes for mock data based on your OpenAPI schemas. By leveraging [JSON Schema Faker](https://github.com/json-schema-faker/json-schema-faker), this plugin automates the creation of flexible mock data builders, making testing and prototyping easier.

## Features

- **Builder Pattern for Mock Data:** Generates a TypeScript builder class for each OpenAPI schema, allowing you to override specific fields and generate mock objects.
- **Automatic Reference Resolution:** Handles `$ref` and schema composition, so your builders reflect your OpenAPI definitions accurately.
- **Seamless Integration:** Designed to work with Hey API's plugin system and TypeScript type generation.
- **Configurable Output:** Choose the output filename and other options to fit your project structure.

## Installation

Add **hey-api-builders** to your project:

```bash
npm install hey-api-builders
```

Or with Yarn:

```bash
yarn add hey-api-builders
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
      // Optional: plugin-specific options
      // output: 'builders.gen.ts'
    }),
  ],
});
```

## Usage

After running the Hey API code generation, you'll get a file (default: `builders`) containing builder classes for each schema.

Example usage:

```typescript
import { UserBuilder, createUserBuilder } from './client/builders';

const user = new UserBuilder()
  .withName('Alice')
  .withEmail('alice@example.com')
  .build();
```

- Each builder class provides `with<Property>` methods for each property in the schema, allowing you to override default mock values.
- The `build()` method returns a mock object conforming to your schema and TypeScript types.

## Configuration Options

- **name** (string): Unique plugin name. Default: `'hey-api-builders'`.
- **output** (string): Output filename (without extension) for the generated builders. Default: `'builders'`.

Example:

```typescript
defineBuildersConfig({
  output: 'custom-builders',
});
```

## How It Works

- For each schema, a builder class is generated with:
  - `with<Property>(value)` methods for each property.
  - A `build()` method that generates a mock object using JSON Schema Faker, applying any overrides you set.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on the [GitHub repository](https://github.com/JeffreyNijs/hey-api-builders).

## License

MIT License. See [LICENSE](./LICENSE) for details.

---

By integrating **hey-api-builders** into your workflow, you can quickly generate and customize mock data for testing and development, all strongly typed and based on your OpenAPI schemas.
