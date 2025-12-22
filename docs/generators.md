# Code Generation

Zintrust includes a powerful code generation engine that helps you scaffold your application quickly while maintaining consistency.

## Core Generators

The `zin add` command uses these generators under the hood:

- `model`: Generates a new ORM model.
- `controller`: Generates a new HTTP controller.
- `migration`: Generates a new database migration.
- `middleware`: Generates a new middleware class.
- `service`: Generates a new microservice structure.
- `routes`: Generates a new route file.
- `feature`: Generates a new feature module.

## Advanced Generators

Zintrust also provides generators for testing, data seeding, and deployment:

- `factory`: Generates a model factory for testing.
- `seeder`: Generates a database seeder.
- `requestfactory`: Generates a service-to-service request factory.
- `responsefactory`: Generates a mock response factory for testing.
- `workflow`: Generates GitHub Actions deployment workflows (Lambda, Fargate, Cloudflare, Deno).

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
