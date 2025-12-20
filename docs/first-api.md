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
import { Controller } from '@http/Controller';
import { Task } from '@models/Task';

export class TaskController extends Controller {
  async index() {
    const tasks = await Task.query().get();
    return this.json(tasks);
  }

  async store(req) {
    const task = new Task(req.body);
    await task.save();
    return this.json(task, 201);
  }
}
```

## 3. Register the Routes

Add the routes to `routes/api.ts`:

```typescript
router.get('/tasks', 'TaskController@index');
router.post('/tasks', 'TaskController@store');
```

## 4. Test Your API

Start the development server:

```bash
npm run dev
```

You can now send a POST request to `http://localhost:3000/tasks` to create a task, and a GET request to see all tasks.
