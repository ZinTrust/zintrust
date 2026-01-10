# Your First API

Building your first API with ZinTrustis fast and intuitive. In this guide, we'll create a simple "Task" API.

## 1. Create the Model and Migration

Use the CLI to generate a model and its corresponding migration:

```bash
zin add model Task --migration
```

Edit the migration in `database/migrations/` to add a `title` and `completed` status:

```typescript
import { MigrationSchema, type IDatabase } from '@zintrust/core';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.create('tasks', (table) => {
      table.id();
      table.string('title');
      table.boolean('completed').default(false);
      table.timestamps();
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('tasks');
  },
};
```

Run the migration:

```bash
zin migrate
```

If your project uses Cloudflare D1 (`DB_CONNECTION=d1` or `d1-remote`), use:

```bash
zin migrate --local --database zintrust_db
```

## 2. Create the Controller

Generate a controller for your tasks:

```bash
zin add controller TaskController
```

Implement the `index` and `store` methods:

```typescript
import { Task } from '@app/Models/Task';
import { Controller, type IRequest, type IResponse } from '@zintrust/core';

export const TaskController = {
  async index(_req: IRequest, res: IResponse): Promise<void> {
    const tasks = await Task.query().get();
    Controller.json(res, { data: tasks });
  },

  async store(req: IRequest, res: IResponse): Promise<void> {
    const task = Task.create(req.getBody() as Record<string, unknown>);
    await task.save();
    Controller.json(res, { data: task }, 201);
  },
};
```

## 3. Register the Routes

Add the routes to `routes/api.ts`:

```typescript
import { Router, type IRouter } from '@zintrust/core';
import { TaskController } from '@app/Controllers/TaskController';

export function registerRoutes(router: IRouter): void {
  Router.get(router, '/tasks', TaskController.index);
  Router.post(router, '/tasks', TaskController.store);
}
```

## 4. Test Your API

Start the development server:

```bash
zin start
```

You can now send a POST request to `http://localhost:7777/tasks` to create a task, and a GET request to see all tasks.
