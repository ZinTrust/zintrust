# Custom Headers for Proxy Requests

ZinTrust proxy adapters (MySQL, PostgreSQL, MongoDB, SQL Server, Redis) support sending custom HTTP headers to proxy servers. This feature is useful for distributed tracing, custom authentication, request correlation, and other metadata that needs to be forwarded to the proxy infrastructure.

## Overview

When your application makes requests to a proxy server (e.g., MySQL proxy for Cloudflare Workers), you can include custom headers that will be forwarded along with the request. The proxy server can then use these headers for logging, authentication, tracing, or other purposes.

## How It Works

### Environment Variable Pattern

Custom headers are configured using environment variables with the following pattern:

```
<PROXY_TYPE>_PROXY_HEADERS_<Header-Name>=<Header-Value>
```

Where:

- `<PROXY_TYPE>` is the proxy type (MYSQL, POSTGRES, MONGODB, SQLSERVER, REDIS)
- `<Header-Name>` is the HTTP header name (underscores are converted to hyphens)
- `<Header-Value>` is the header value

### Header Name Transformation

Environment variable names are automatically transformed to HTTP header names:

- The `<PROXY_TYPE>_PROXY_HEADERS_` prefix is stripped
- Remaining underscores (`_`) are converted to hyphens (`-`)

**Examples:**

- `MYSQL_PROXY_HEADERS_X_Tracing_Id` → `X-Tracing-Id`
- `POSTGRES_PROXY_HEADERS_X_Request_Id` → `X-Request-Id`
- `MONGODB_PROXY_HEADERS_X_Custom_Auth` → `X-Custom-Auth`

## Usage Examples

### MySQL Proxy

Add custom headers for MySQL proxy requests:

```env
MYSQL_PROXY_HEADERS_X_Tracing_Id=trace-12345
MYSQL_PROXY_HEADERS_X_Request_Id=req-67890
MYSQL_PROXY_HEADERS_X_Client-Version=1.0.0
```

### PostgreSQL Proxy

Add custom headers for PostgreSQL proxy requests:

```env
POSTGRES_PROXY_HEADERS_X_Tracing_Id=trace-12345
POSTGRES_PROXY_HEADERS_X_Tenant-Id=tenant-abc
```

### MongoDB Proxy

Add custom headers for MongoDB proxy requests:

```env
MONGODB_PROXY_HEADERS_X_Tracing_Id=trace-12345
MONGODB_PROXY_HEADERS_X_Collection-Name=users
```

### SQL Server Proxy

Add custom headers for SQL Server proxy requests:

```env
SQLSERVER_PROXY_HEADERS_X_Tracing_Id=trace-12345
SQLSERVER_PROXY_HEADERS_X_Application-Id=my-app
```

### Redis Proxy

Add custom headers for Redis proxy requests:

```env
REDIS_PROXY_HEADERS_X_Tracing_Id=trace-12345
REDIS_PROXY_HEADERS_X_Cache-Key-Prefix=prod
```

### SMTP Proxy

Add custom headers for SMTP proxy requests:

```env
SMTP_PROXY_HEADERS_X_Tracing_Id=trace-12345
SMTP_PROXY_HEADERS_X_Message-Id=msg-456
SMTP_PROXY_HEADERS_X_Campaign-Id=campaign-789
```

## Proxy Server Access

On the proxy server side, custom headers are available in the `request.headers` object:

```typescript
// In your proxy server handler
const handleRequest = async (request: ProxyRequest) => {
  const tracingId = request.headers['x-tracing-id'];
  const requestId = request.headers['x-request-id'];

  // Use headers for logging, authentication, etc.
  console.log(`Request ${requestId} with trace ${tracingId}`);

  // ... process request
};
```

## Use Cases

### 1. Distributed Tracing

Add tracing information to correlate requests across services:

```env
MYSQL_PROXY_HEADERS_X_Tracing_Id=${TRACE_ID}
MYSQL_PROXY_HEADERS_X_Span_Id=${SPAN_ID}
```

### 2. Request Correlation

Add request IDs for debugging and monitoring:

```env
POSTGRES_PROXY_HEADERS_X_Request_Id=${REQUEST_ID}
POSTGRES_PROXY_HEADERS_X_Session-Id=${SESSION_ID}
```

### 3. Custom Authentication

Add custom authentication tokens or API keys:

```env
MONGODB_PROXY_HEADERS_X_Custom-Auth=${AUTH_TOKEN}
MONGODB_PROXY_HEADERS_X_Api-Key=${API_KEY}
```

### 4. Multi-Tenancy

Add tenant identifiers for multi-tenant applications:

```env
SQLSERVER_PROXY_HEADERS_X_Tenant-Id=${TENANT_ID}
SQLSERVER_PROXY_HEADERS_X_Organization-Id=${ORG_ID}
```

### 5. Client Identification

Add client version or identification information:

```env
REDIS_PROXY_HEADERS_X_Client-Version=${APP_VERSION}
REDIS_PROXY_HEADERS_X_Client-Id=${CLIENT_ID}
```

## Security Considerations

### Sensitive Data

**Warning:** Be careful when including sensitive information in custom headers:

- Headers are logged by default in many proxy servers
- Headers may be visible in network monitoring tools
- Headers are included in request signatures (if signing is enabled)

### Header Validation

Proxy servers should validate custom headers:

- Check for expected header names
- Validate header values
- Sanitize headers before logging
- Rate limit based on header values if needed

### Signing Impact

When request signing is enabled, custom headers are included in the signature calculation. This means:

- Headers cannot be modified in transit without breaking the signature
- Headers must be consistent between the client and proxy server
- Header changes require coordination between client and proxy

## Troubleshooting

### Headers Not Appearing

If custom headers don't appear in the proxy server:

1. **Check environment variable names**: Ensure they follow the correct pattern
2. **Check proxy type prefix**: Verify you're using the correct proxy type (MYSQL, POSTGRES, etc.)
3. **Check header name transformation**: Remember that underscores become hyphens
4. **Check environment variable loading**: Ensure the environment variables are loaded before the proxy adapter initializes

### Example Debugging

```typescript
// In your proxy server
const handleRequest = async (request: ProxyRequest) => {
  console.log('All headers:', JSON.stringify(request.headers, null, 2));

  // ... process request
};
```

## Implementation Details

### Code Changes

The custom headers feature is implemented in:

1. **Type Definitions** (`src/orm/adapters/SqlProxyAdapterUtils.ts`):
   - Added `customHeaders?: Record<string, string>` to `ProxySettings`

2. **Environment Parsing** (`src/orm/adapters/SqlProxyAdapterUtils.ts`):
   - Added `parseCustomHeadersFromEnv()` function to parse environment variables

3. **HTTP Request** (`src/common/RemoteSignedJson.ts`):
   - Modified `RemoteSignedJson.request()` to include custom headers in fetch requests

4. **Proxy Adapters**:
   - Updated MySQL, PostgreSQL, MongoDB, and SQL Server adapters to use custom headers

### Supported Proxies

Custom headers are supported for:

- ✅ MySQL Proxy (`MYSQL_PROXY_HEADERS_*`)
- ✅ PostgreSQL Proxy (`POSTGRES_PROXY_HEADERS_*`)
- ✅ MongoDB Proxy (`MONGODB_PROXY_HEADERS_*`)
- ✅ SQL Server Proxy (`SQLSERVER_PROXY_HEADERS_*`)
- ✅ Redis Proxy (`REDIS_PROXY_HEADERS_*`)
- ✅ SMTP Proxy (`SMTP_PROXY_HEADERS_*`)

## Migration Guide

If you were previously using a custom solution to pass headers to proxy servers:

1. **Remove custom code**: Delete any custom header injection logic
2. **Set environment variables**: Configure headers using the new pattern
3. **Update proxy server**: Ensure your proxy server reads headers from `request.headers`
4. **Test**: Verify that headers appear correctly in proxy server logs

## Performance Impact

Custom headers have minimal performance impact:

- Headers are parsed once at adapter initialization
- No additional network round trips
- Header parsing is O(n) where n is the number of environment variables
- Memory overhead is proportional to the number of custom headers

## Best Practices

1. **Use descriptive header names**: Follow HTTP header naming conventions
2. **Keep header values small**: Large header values can impact performance
3. **Document custom headers**: Maintain documentation for your custom headers
4. **Validate headers**: Always validate custom headers on the proxy server
5. **Use consistent naming**: Use the same header names across different proxy types
6. **Avoid sensitive data**: Don't put passwords or secrets in custom headers
7. **Monitor header usage**: Track which headers are used and their frequency

## Related Documentation

- [MySQL Proxy Documentation](cloudflare-mysql-proxy.md)
- [Environment Variables Reference](config-env.md)
- [Proxy Server Architecture](../src/proxy/ProxyServer.ts)
