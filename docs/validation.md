# Validation

ZinTrustuses a schema-based validator with a fluent API. You define a schema via `Schema.create()` and validate data using `Validator.validate()`.

## Interface Reference

```typescript
export interface ISchema {
  required(field: string, message?: string): ISchema;
  string(field: string, message?: string): ISchema;
  number(field: string, message?: string): ISchema;
  integer(field: string, message?: string): ISchema;
  boolean(field: string, message?: string): ISchema;
  array(field: string, message?: string): ISchema;
  email(field: string, message?: string): ISchema;
  min(field: string, value: number, message?: string): ISchema;
  max(field: string, value: number, message?: string): ISchema;
  minLength(field: string, value: number, message?: string): ISchema;
  maxLength(field: string, value: number, message?: string): ISchema;
  regex(field: string, pattern: RegExp, message?: string): ISchema;
  in(field: string, values: unknown[], message?: string): ISchema;
  custom(field: string, validator: CustomValidatorFn, message?: string): ISchema;
  alphanumeric(field: string, message?: string): ISchema;
  uuid(field: string, message?: string): ISchema;
  token(field: string, message?: string): ISchema;
  ipAddress(field: string, message?: string): ISchema;
  positiveNumber(field: string, message?: string): ISchema;
  digits(field: string, message?: string): ISchema;
  decimal(field: string, message?: string): ISchema;
  url(field: string, message?: string): ISchema;
  phone(field: string, message?: string): ISchema;
  date(field: string, message?: string): ISchema;
  getRules(): Map<string, ValidationRule[]>;
}
```

## Basic Validation

```typescript
import { Schema, Validator } from '@zintrust/core';

const schema = Schema.create()
  .required('name')
  .string('name')
  .minLength('name', 3)
  .required('email')
  .email('email')
  .integer('age')
  .min('age', 18);

// Throws a ValidationError when invalid
Validator.validate(req.body as Record<string, unknown>, schema);
```

## Non-throwing Validation

Use `Validator.isValid()` when you prefer a boolean result:

```typescript
import { Schema, Validator } from '@zintrust/core';

const schema = Schema.create().required('email').email('email');
const ok = Validator.isValid(req.body as Record<string, unknown>, schema);
```

## Available Schema Rules

- `required(field)`
- `string(field)`
- `number(field)`
- `integer(field)`
- `boolean(field)`
- `array(field)`
- `email(field)`
- `min(field, value)` / `max(field, value)` (numeric)
- `minLength(field, value)` / `maxLength(field, value)` (string/array)
- `regex(field, pattern)`
- `in(field, values)`
- `custom(field, (value, data?) => boolean)`

## Rule-String Compatibility (Optional)

If you prefer pipe-delimited rule strings, the core validator also supports a safe compatibility layer:

```typescript
import { Validator } from '@zintrust/core';

const rules = {
  name: 'required|string|min:3',
  age: 'integer|min:18',
};

Validator.validateRules(req.body as Record<string, unknown>, rules);
```

Non-throwing variant:

```typescript
import { Validator } from '@zintrust/core';

const ok = Validator.isValidRules(req.body as Record<string, unknown>, {
  email: 'required|email',
});
```

### Supported rule tokens

- `required`, `string`, `number`, `integer`, `boolean`, `array`, `email`
- `min:<n>` / `max:<n>` (numeric)
- `min:<n>` / `max:<n>` (mapped to length checks when `string` or `array` is also present)
- `minLength:<n>` / `maxLength:<n>`
- `regex:/.../flags`
- `in:a,b,c`
- `confirmed` (expects `${field}_confirmation`)
- `nullable` (accepted but currently a no-op; this validator already treats missing fields as allowed unless `required`)

### Notes on `unique`

The common `unique:table,column` token is **not supported** by the built-in rule-string API.

Reason: `unique` requires a database query (and is typically async + adapter-specific). The core validator is intentionally pure/synchronous so it can run everywhere (Node, Workers) without pulling in DB dependencies.

If you need uniqueness checks, do them at the persistence layer (e.g., rely on a UNIQUE index/constraint and handle the conflict), or use a schema `custom(...)` rule with your own database check where it makes sense.

## Validation Middleware

Generated apps include a `validationMiddleware(schema)` helper (see `app/Middleware/index.ts`) that:

- runs `Validator.validate(body, schema)` for non-GET/DELETE requests
- returns `422` with `{ errors: ... }` when the error provides `toObject()`

## Notes

- Rule strings are supported via `Validator.validateRules/isValidRules`, but only for the supported token set above.
