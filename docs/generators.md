# Code Generation

Zintrust includes a powerful code generation engine that helps you scaffold your application quickly while maintaining consistency.

## Core Generators

The `zin add` command uses these generators under the hood:

- `model`: Generates a new ORM model.
- `controller`: Generates a new HTTP controller.
- `migration`: Generates a new database migration.
- `middleware`: Generates a new middleware class.
- `service`: Generates a new microservice structure.

## Advanced Generators

Zintrust also provides generators for testing and data seeding:

- `factory`: Generates a model factory for testing.
- `seeder`: Generates a database seeder.
- `request-factory`: Generates a service-to-service request factory.
- `response-factory`: Generates a mock response factory for testing.

## Custom Templates

You can customize the generated code by creating your own templates in `.zintrust/templates/`.

```bash
# Example: Customizing the controller template
cp src/cli/scaffolding/templates/controller.stub .zintrust/templates/controller.stub
```

## Batch Generation

You can generate multiple components at once:

```bash
zin add model Product --migration --controller --factory
```
