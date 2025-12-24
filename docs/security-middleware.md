# Security Middleware

Zintrust provides a robust, zero-dependency security middleware suite to protect your application from common web vulnerabilities.

## Installation

The security middleware is included in the core framework. You can import it from `@middleware`.

```typescript
import { SecurityMiddleware, RateLimiter, CsrfMiddleware } from '@middleware';
```

## Security Headers (Helmet & CORS)

The `SecurityMiddleware` handles standard security headers and CORS configuration.

### Usage

```typescript
// In your application boot or route file
app.getMiddlewareStack().register(
  'security',
  SecurityMiddleware.create({
    // Optional: Configure CORS
    cors: {
      origin: ['https://example.com'],
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
    // Optional: Configure HSTS
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
    },
  })
);
```

### Features

- **HSTS**: Enforces HTTPS connections.
- **X-Frame-Options**: Prevents clickjacking attacks.
- **X-Content-Type-Options**: Prevents MIME-sniffing.
- **Referrer-Policy**: Controls referrer information.
- **CORS**: Full Cross-Origin Resource Sharing support.
- **CSP**: Content Security Policy support.

## Rate Limiting

Protect your API from brute-force attacks and abuse with the `RateLimiter`.

### Usage

```typescript
app.getMiddlewareStack().register(
  'rateLimit',
  RateLimiter.create({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: 'Too many requests from this IP, please try again later.',
  })
);
```

### Configuration Options

| Option         | Type     | Default  | Description                            |
| -------------- | -------- | -------- | -------------------------------------- |
| `windowMs`     | number   | 60000    | Time window in milliseconds            |
| `max`          | number   | 100      | Max requests per window                |
| `message`      | string   | ...      | Error message response                 |
| `statusCode`   | number   | 429      | HTTP status code                       |
| `keyGenerator` | function | IP based | Function to generate unique client key |

## CSRF Protection

Cross-Site Request Forgery (CSRF) protection using the Double Submit Cookie pattern.

### Usage

```typescript
app.getMiddlewareStack().register('csrf', CsrfMiddleware.create());
```

### How it Works

1.  **GET Requests**: The middleware automatically generates a token and sets it as a cookie (`XSRF-TOKEN`) and in `res.locals.csrfToken`.
2.  **POST/PUT/DELETE Requests**: The middleware verifies the token from the header (`X-CSRF-Token`) or body (`_csrf`) matches the token.

### Frontend Integration

**Axios:**
Axios automatically picks up the `XSRF-TOKEN` cookie and sends it in the `X-XSRF-TOKEN` header.

**Fetch API:**
You need to manually read the cookie and set the header:

```javascript
const token = document.cookie.match(/XSRF-TOKEN=([^;]+)/)[1];

fetch('/api/data', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': token,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data),
});
```
