# Routing

ZinTrust provides a simple and expressive routing system to map URLs to controllers or closures.

## Interface Reference

```typescript
export type IRouter = {
  routes: Route[];
  prefix: string;
  routeIndex: Map\<string, Route[]>;
};

export type RouteHandler = (req: IRequest, res: IResponse) => Promise\<void> | void;

export interface Route {
  method: string;
  path: string;
  pattern: RegExp;
  handler: RouteHandler;
  paramNames: string[];
  middleware?: string[];
}
```

## Basic Routing

Routes are defined in `routes/api.ts`.

```typescript
import { router } from '@zintrust/core';

router.get('/', async (req, res) => {
  return res.json({ message: 'Welcome to ZinTrust' });
});

router.post('/users', 'UserController@store');
```

## Route Parameters

You can capture segments of the URI within your route:

```typescript
router.get('/users/:id', async (req, res) => {
  const id = req.params.id;
  return res.json({ userId: id });
});
```

## Route Groups

Groups allow you to share route attributes, such as middleware or prefixes, across a large number of routes:

```typescript
router.group({ prefix: '/api/v1', middleware: ['auth'] }, (r) => {
  r.get('/profile', 'ProfileController@show');
  r.put('/profile', 'ProfileController@update');
});
```

## Resource Routes

Resource routing assigns typical "CRUD" routes to a controller with a single line of code:

```typescript
router.resource('/posts', PostController);
```

This will generate:

- `GET /posts` (index)
- `GET /posts/:id` (show)
- `POST /posts` (store)
- `PUT /posts/:id` (update)
- `DELETE /posts/:id` (destroy)
