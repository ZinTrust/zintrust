# Plug & Play Secure Payload

`SecurePayload` is the first reusable Plug & Play decoding pipeline in ZinTrust.

It standardizes a repeated service workflow:

1. decrypt an incoming payload
2. parse JSON safely
3. coerce primitive values
4. validate schema
5. return a typed result

The pipeline is invocation-scoped. It does not retain decoded payloads or request state after resolution.

## Why It Exists

Without a shared pipeline, every service re-implements variations of:

```ts
const decrypted = await decryptPayload(rawPayload);
const parsed = JSON.parse(decrypted);
const record = parsed as Record<string, unknown>;
const amount = Number(record.amount ?? 0);
```

That duplicates error handling and encourages inconsistent coercion and validation behavior.

## Core API

```ts
import { SecurePayload } from '@zintrust/core';

const pipeline = SecurePayload.decode(rawPayload, {
  decryptor: 'payments',
  context: {
    encryption: Encryption.connection('default'),
  },
});
```

Available pipeline stages:

1. `.decrypt()`
2. `.json()`
3. `.coerce({...})`
4. `.validate(schema)`
5. `.typed<T>()`
6. `.value()`

## Registering a decryptor

```ts
SecurePayload.registerDecryptor('payments', async (raw, context) => {
  return context.encryption.decryptString(raw);
});
```

Use `registerDecryptor(...)` for shared app-level decryptors that are configured during startup.

You can inspect and manage the registry explicitly:

```ts
SecurePayload.hasDecryptor('payments');
SecurePayload.listDecryptors();
SecurePayload.unregisterDecryptor('payments');
```

## Using an inline decryptor

Use an inline decryptor when the decryption behavior depends on request-scoped context that should not be kept globally.

```ts
const payload = await SecurePayload.decode(rawPayload, {
  decryptor: async (raw) => customDecrypt(raw, requestScopedKey),
})
  .decrypt()
  .json()
  .typed<MyPayload>();
```

## Using EncryptedEnvelope

If your service already uses ZinTrust encrypted envelopes, create a decryptor directly from the built-in envelope primitive:

```ts
const decryptor = SecurePayload.createEnvelopeDecryptor({
  cipher: 'aes-256-cbc',
  key: process.env.APP_KEY ?? '',
  previousKeys: [],
});

SecurePayload.registerDecryptor('default-envelope', decryptor);
```

## Full example with coercion and validation

```ts
import { Schema, SecurePayload } from '@zintrust/core';

const schema = Schema.create()
  .required('amount')
  .number('amount')
  .required('currency')
  .string('currency')
  .required('active')
  .boolean('active');

const payload = await SecurePayload.decode(rawPayload, {
  decryptor: 'default-envelope',
})
  .decrypt()
  .json()
  .coerce({
    amount: 'number',
    active: 'boolean',
  })
  .validate(schema)
  .typed<{
    amount: number;
    currency: string;
    active: boolean;
  }>();
```

## Supported coercions

`SecurePayload.coerce(...)` currently supports:

1. `string`
2. `number`
3. `integer`
4. `boolean`

Example:

```ts
.coerce({
  amount: 'number',
  retries: 'integer',
  active: 'boolean',
  currency: 'string',
})
```

## Failure semantics

Failures are normalized by pipeline stage. The thrown error message includes the failing stage:

1. `SecurePayload decrypt failed: ...`
2. `SecurePayload json failed: ...`
3. `SecurePayload coerce failed: ...`
4. `SecurePayload validate failed: ...`

That makes logging, monitoring, and test assertions consistent across services.

## Runtime safety

`SecurePayload` is designed to avoid common product-fit failures:

1. pipeline state exists only inside one decode call
2. there is no retained per-request cache
3. decryptor registration is explicit and manageable
4. inline decryptors keep request-scoped secrets out of global registries

## Recommended usage rules

1. register long-lived decryptors during startup only
2. use inline decryptors for request-specific keys or tenant-specific context
3. validate after coercion, not before
4. keep decrypted payload handling local to the action that needs it
5. avoid logging decrypted secrets
