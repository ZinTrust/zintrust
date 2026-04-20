# JWK and JWKS JWT Verification

ZinTrust includes `JwtVerifier` for the common case where your app needs to trust tokens issued by another platform.

This is useful when you accept identity tokens or access tokens from providers such as Apple, Google, Auth0, Azure AD, or your own external identity service. Instead of copying provider-specific verification code into each project, you can verify the token with a single reusable helper.

## When to use `JwtVerifier`

Use `JwtVerifier` when:

- the JWT was signed by another system
- the public key comes from a JWK or JWKS endpoint
- you want issuer and audience checks in the same verification step
- you need the code to work in both Node.js and Cloudflare Workers

If you are signing and verifying your own application tokens with local secrets or keys, keep using `JwtManager`.

## Verify with a JWKS URL

This is the most common path. ZinTrust fetches the JWKS document, finds the matching `kid`, imports the public key with WebCrypto, verifies the signature, and then validates the claims you asked for.

```ts
import { JwtVerifier } from '@zintrust/core';

const payload = await JwtVerifier.verifyWithJwks({
  token: identityToken,
  jwksUrl: 'https://appleid.apple.com/auth/keys',
  issuer: 'https://appleid.apple.com',
  audience: process.env.APPLE_CLIENT_ID,
  cacheTtlSeconds: 3600,
});

console.log(payload.sub);
```

### What happens during verification

`JwtVerifier.verifyWithJwks(...)` checks:

- the token has a valid JWT structure
- the header algorithm matches `RS256`
- the header includes a `kid`
- the JWKS endpoint returns a valid keys array
- the matching key can be imported as an RSA verification key
- the signature is valid
- `exp` and `nbf` claims still allow the token
- `iss` matches your expected issuer when you provide one
- `aud` matches your expected audience when you provide one

## Verify with a single JWK

If you already have the exact public key, you can skip the network call and verify directly.

```ts
import { JwtVerifier } from '@zintrust/core';

const payload = await JwtVerifier.verifyWithJwk({
  token,
  jwk: providerPublicKey,
  issuer: 'https://issuer.example.com',
  audience: 'my-api-client',
});
```

This is a good fit when:

- your provider gives you a fixed public key
- you cache keys somewhere else in your application
- you want full control over how keys are loaded

## Result mode vs throwing mode

ZinTrust gives you two styles.

Throwing mode:

```ts
const payload = await JwtVerifier.verifyWithJwks({
  token,
  jwksUrl: 'https://issuer.example.com/.well-known/jwks.json',
  issuer: 'https://issuer.example.com',
  audience: 'web-client',
});
```

Result mode:

```ts
const result = await JwtVerifier.verifyWithJwksResult({
  token,
  jwksUrl: 'https://issuer.example.com/.well-known/jwks.json',
  issuer: 'https://issuer.example.com',
  audience: 'web-client',
});

if (!result.ok) {
  console.log(result.reason);
  console.log(result.message);
  return;
}

console.log(result.payload.sub);
```

Use result mode when you want to branch on the exact failure reason without catching exceptions.

## Supported failure reasons

`verifyWithJwkResult(...)` and `verifyWithJwksResult(...)` return clear machine-readable reasons such as:

- `missing_kid`
- `key_not_found`
- `jwks_fetch_failed`
- `invalid_jwks`
- `invalid_signature`
- `issuer_mismatch`
- `audience_mismatch`
- `token_expired`
- `token_not_yet_valid`

When you use the throwing APIs, ZinTrust raises a normal security error and includes the reason in `error.details.reason`.

## JWKS caching

`JwtVerifier` keeps JWKS documents in an in-memory module cache so repeated verification calls do not fetch the same key set every time.

```ts
await JwtVerifier.verifyWithJwks({
  token,
  jwksUrl: 'https://issuer.example.com/.well-known/jwks.json',
  cacheKey: 'issuer-main-jwks',
  cacheTtlSeconds: 1800,
});
```

Use `cacheKey` when different parts of your app should share the same cached document even if they build the URL in different places.

If you need to force a refresh, clear the cache.

```ts
JwtVerifier.clearCache('issuer-main-jwks');

// Or clear every cached JWKS document
JwtVerifier.clearCache();
```

## Practical example: Apple Sign In

```ts
import { ErrorFactory, JwtVerifier } from '@zintrust/core';

export const verifyAppleIdentityToken = async (identityToken: string) => {
  const payload = await JwtVerifier.verifyWithJwks({
    token: identityToken,
    jwksUrl: 'https://appleid.apple.com/auth/keys',
    issuer: 'https://appleid.apple.com',
    audience: process.env.APPLE_CLIENT_ID,
    cacheKey: 'apple-sign-in-jwks',
    cacheTtlSeconds: 3600,
  });

  if (typeof payload.sub !== 'string' || payload.sub.trim() === '') {
    throw ErrorFactory.createUnauthorizedError('Apple token did not include a subject');
  }

  return {
    provider: 'apple',
    providerUserId: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  };
};
```

## Practical example: middleware or controller flow

```ts
import { ErrorFactory, JwtVerifier } from '@zintrust/core';

export const loginWithExternalProvider = async (token: string) => {
  const result = await JwtVerifier.verifyWithJwksResult({
    token,
    jwksUrl: 'https://issuer.example.com/.well-known/jwks.json',
    issuer: 'https://issuer.example.com',
    audience: 'mobile-app',
  });

  if (!result.ok) {
    throw ErrorFactory.createUnauthorizedError(
      `External token verification failed: ${result.reason}`
    );
  }

  return result.payload;
};
```

## Notes and limits

- The current helper verifies `RS256` tokens.
- The current helper expects RSA JWKs that include `n` and `e`.
- The JWKS cache is process-local memory, which is usually what you want for runtime verification.
- If your provider rotates keys, keep a reasonable TTL so refreshes happen automatically.

## Choosing between `JwtManager` and `JwtVerifier`

Use `JwtManager` when ZinTrust is the issuer.

Use `JwtVerifier` when another platform is the issuer and your app only needs to trust the token.
