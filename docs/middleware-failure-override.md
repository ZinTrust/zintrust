## Overriding Middleware Failure Responses

ZinTrust middleware returns a structured failure payload by default and keeps the middleware-provided status code unless a custom responder changes it:

```json
{
  "error": {
    "code": "SOME_ERROR_CODE",
    "message": "Human readable message"
  }
}
```

For auth and jwt middleware, the default unauthorized status remains `401`.

The supported extension point is the responder contract exposed through middleware configuration. A responder can:

1. keep the default status and only reshape the body
2. replace both the public body shape and the HTTP status when a project needs a different contract

Example:

```ts
// app/Middleware/AuthFailureResponder.ts
import type { MiddlewareFailureResponder } from '@zintrust/core';

export const authFailureResponder: MiddlewareFailureResponder = async (_req, res, context) => {
  res.setStatus(403).json({
    message: 'Unauthorized',
    status: 403,
    ty: 'OT',
    reason: context.reason,
  });
};
```

Then wire it through project middleware config:

```ts
// config/middleware.ts
import { authFailureResponder } from '@app/Middleware/AuthFailureResponder';

export default {
  responders: {
    auth: authFailureResponder,
    jwt: authFailureResponder,
  },
};
```

Notes:

1. the root package exports `defaultMiddlewareFailureResponder`, `respondWithMiddlewareFailure`, and the responder types
2. the root package does not currently export `createDefaultMiddlewareFailureBody`
3. there is no public `MiddlewareFailureResponder.create(...)` helper on the root package
4. prefer responders for app-level customization instead of patching installed core middleware files

If you need to keep the default `401`, simply write your responder with `context.statusCode` instead of replacing it.
