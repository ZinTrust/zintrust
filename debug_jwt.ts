import { JwtVerifier } from './src/security/JwtVerifier';
import { generateJwtKeyPair, createRs256Token } from './tests/unit/security/JwtVerifier.test.ts';

async function run() {
    const keyPair = await generateJwtKeyPair();
    const token = await createRs256Token({
      privateKey: keyPair.privateKey,
      payload: {
        sub: 'user-1',
        iss: 'https://appleid.apple.com',
        aud: 'apple-client-id',
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      kid: keyPair.publicJwk.kid,
    });

    const fetcher = (url: string) => Promise.resolve(new Response(JSON.stringify({ keys: [keyPair.publicJwk] }), { status: 200 }));

    console.log("Starting first call");
    const first = await JwtVerifier.verifyWithJwksResult({
      token,
      jwksUrl: 'https://appleid.apple.com/auth/keys',
      issuer: 'https://appleid.apple.com',
      audience: 'apple-client-id',
      cacheKey: 'apple-jwks',
      cacheTtlSeconds: 60,
      nowMs: 1_000,
      fetcher: fetcher as any,
    });
    console.log("First:", JSON.stringify(first, null, 2));

    console.log("Starting second call");
    const second = await JwtVerifier.verifyWithJwksResult({
      token,
      jwksUrl: 'https://appleid.apple.com/auth/keys',
      issuer: 'https://appleid.apple.com',
      audience: 'apple-client-id',
      cacheKey: 'apple-jwks',
      cacheTtlSeconds: 60,
      nowMs: 50_000,
      fetcher: fetcher as any,
    });
    console.log("Second:", JSON.stringify(second, null, 2));

    console.log("Starting third call");
    const third = await JwtVerifier.verifyWithJwksResult({
      token,
      jwksUrl: 'https://appleid.apple.com/auth/keys',
      issuer: 'https://appleid.apple.com',
      audience: 'apple-client-id',
      cacheKey: 'apple-jwks',
      cacheTtlSeconds: 60,
      nowMs: 70_000,
      fetcher: fetcher as any,
    });
    console.log("Third:", JSON.stringify(third, null, 2));
}

run().catch(console.error);
