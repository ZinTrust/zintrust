# Controllers

Controllers group related request handling logic into a single class.

## Creating Controllers

```bash
zin add controller UserController
```

## Basic Controller

```typescript
import { Controller } from '@http/Controller';

export class UserController extends Controller {
  async show(req) {
    const user = await User.query().find(req.params.id);

    if (!user) {
      return this.error('User not found', 404);
    }

    return this.json(user);
  }
}
```

## Dependency Injection

Zintrust supports basic dependency injection in controller constructors:

```typescript
export class UserController extends Controller {
  constructor(private userService: UserService) {
    super();
  }
}
```

## Response Helpers

The base `Controller` class provides several helper methods:

- `this.json(data, status)`: Returns a JSON response.
- `this.error(message, status)`: Returns an error response.
- `this.redirect(url)`: Redirects the user.
- `this.download(path)`: Initiates a file download.
