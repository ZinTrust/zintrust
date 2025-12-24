# Your First API

Building your first API with Zintrust is fast and intuitive. In this guide, we'll create a simple "Task" API.

## 1. Create the Model and Migration

Use the CLI to generate a model and its corresponding migration:

```bash
zin add model Task --migration
```

Edit the migration in `database/migrations/` to add a `title` and `completed` status:

```typescript
export async function up(db: Database) {
  await db.createTable('tasks', (table) => {
    table.id();
    table.string('title');
    table.boolean('completed').default(false);
    table.timestamps();
  });
}
```

Run the migration:

```bash
zin migrate
```

## 2. Create the Controller

Generate a controller for your tasks:

```bash
zin add controller TaskController
```

Implement the `index` and `store` methods:

```typescript
import { Task } from '@app/Models/Task';
import { Controller } from '@http/Controller';
import { IRequest } from '@http/Request';
import { IResponse } from '@http/Response';

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
import { Router, type IRouter } from '@routing/Router';
import { TaskController } from '@app/Controllers/TaskController';

export function registerRoutes(router: IRouter): void {
  Router.get(router, '/tasks', TaskController.index);
  Router.post(router, '/tasks', TaskController.store);
}
```

## 4. Test Your API

Start the development server:

```bash
npm run dev
```

You can now send a POST request to `http://localhost:3000/tasks` to create a task, and a GET request to see all tasks.
