# Security

Zintrust is built with security as a top priority, providing built-in protection against common web vulnerabilities.

## SQL Injection

The ORM and Query Builder use prepared statements for all queries, making your application immune to SQL injection by default.

## Cross-Site Request Forgery (CSRF)

Zintrust includes a `CsrfMiddleware` that automatically verifies CSRF tokens for all state-changing requests (POST, PUT, DELETE).

```typescript
// In your HTML form
<input type="hidden" name="_token" value="{{ csrf_token() }}">
```

## Cross-Site Scripting (XSS)

The framework provides an `XssProtection` utility to sanitize user input and prevent XSS attacks.

```typescript
import { Xss } from '@security/Xss';

const cleanHtml = Xss.sanitize(req.body.content);
```

## Password Hashing

Always use the built-in `Hash` utility for storing passwords:

```typescript
import { Hash } from '@security/Hash';

const hashedPassword = await Hash.make(password);
const matches = await Hash.check(password, hashedPassword);
```

## Rate Limiting

Protect your API from brute-force attacks using the `RateLimiter` middleware:

```typescript
router.get('/login', 'AuthController@login', { middleware: ['throttle:6,1'] });
```
