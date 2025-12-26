# Controllers

Controllers group related request handling logic into a single module (plain object / factory).

## Creating Controllers

```bash
zin add controller UserController
```

## Basic Controller

```typescript
import { User } from '@app/Models/User';
import { Controller, type IRequest, type IResponse } from '@zintrust/core';

export const UserController = {
  async show(req: IRequest, res: IResponse): Promise<void> {
    const user = await User.find(req.params['id']);

    if (user === null) {
      Controller.error(res, 'User not found', 404);
      return;
    }

    Controller.json(res, { data: user });
  },
};
```

**Or with dynamic imports:**

```typescript
import { Controller, type IRequest, type IResponse } from '@zintrust/core';

export const UserController = {
  async show(req: IRequest, res: IResponse): Promise<void> {
    const { User } = await import('@app/Models/User');
    const user = await User.find(req.params['id']);

    if (user === null) {
      Controller.error(res, 'User not found', 404);
      return;
    }

    Controller.json(res, { data: user });
  },
};
```

## Dependency Injection

For dependency injection, prefer a factory function that closes over dependencies:

```typescript
export const createUserController = (userService: UserService) => ({
  async show(req: IRequest, res: IResponse): Promise<void> {
    const user = await userService.getById(req.params['id']);
    Controller.json(res, { data: user });
  },
});
```

## Response Helpers

The `Controller` namespace provides several helper methods:

- `this.json(data, status)`: Returns a JSON response.
- `this.error(message, status)`: Returns an error response.
- `this.redirect(url)`: Redirects the user.
- `this.download(path)`: Initiates a file download.
