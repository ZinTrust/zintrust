# Helper Utilities Reference

The `@zintrust/core` module provides lightweight, runtime-agnostic validation and type-checking utilities designed for use in both Node.js and Serverless Worker environments.

## Table of Contents

1. [Type Checkers](#type-checkers)
2. [Empty / Null / Undefined](#empty--null--undefined)
3. [Boolean Helpers](#boolean-helpers)
4. [Numeric Checks](#numeric-checks)
5. [String / Format Checks](#string--format-checks)
6. [Collection / Length](#collection--length)
7. [Non-Empty Checks](#non-empty-checks)
8. [Additional Format Checks](#additional-format-checks)
9. [Numeric Predicates](#numeric-predicates)

---

## Type Checkers

These functions perform basic type checking with TypeScript type guards.

### `isString(value): value is string`

Check whether value is a string primitive.

```typescript
import { isString } from '@zintrust/core';

isString('hello'); // true
isString(123); // false
isString(null); // false

if (isString(val)) {
  // TypeScript knows val is a string here
  console.log(val.toUpperCase());
}
```

### `isArray(value): value is unknown[]`

Check whether value is an array.

```typescript
import { isArray } from '@zintrust/core';

isArray([1, 2, 3]); // true
isArray('array-like'); // false
isArray({ length: 3 }); // false

if (isArray(items)) {
  items.forEach((item) => console.log(item));
}
```

### `isObject(value): value is Record<string, unknown>`

Check whether value is an object (but not null, array, or function).

```typescript
import { isObject } from '@zintrust/core';

isObject({ a: 1 }); // true
isObject([]); // false
isObject(null); // false
isObject(() => {}); // false

if (isObject(data)) {
  Object.entries(data).forEach(([key, val]) => {
    console.log(`${key}: ${val}`);
  });
}
```

### `isFunction(value): value is (...args: unknown[]) => unknown`

Check whether value is a function.

```typescript
import { isFunction } from '@zintrust/core';

isFunction(() => {}); // true
isFunction(function () {}); // true
isFunction('not a func'); // false

if (isFunction(callback)) {
  callback();
}
```

### `isDate(value): value is Date`

Check whether value is a valid Date object.

```typescript
import { isDate } from '@zintrust/core';

isDate(new Date()); // true
isDate('2024-01-01'); // false
isDate(new Date(NaN)); // false (Invalid Date)

if (isDate(date)) {
  console.log(date.toISOString());
}
```

---

## Empty / Null / Undefined

These functions check for empty, null, and undefined values with legacy semantics.

### `isEmpty(value): boolean`

Check if value is "empty" following legacy semantics:

- `null`, `undefined`, `false`, `0`, `''`, `'0'` are all considered empty

```typescript
import { isEmpty } from '@zintrust/core';

isEmpty(null); // true
isEmpty(undefined); // true
isEmpty(false); // true
isEmpty(0); // true
isEmpty(''); // true
isEmpty('0'); // true
isEmpty('hello'); // false
isEmpty([]); // false
isEmpty({}); // false

// Legacy pattern replacement
if (!isEmpty(userInput)) {
  processInput(userInput);
}
```

### `isNull(value): boolean`

Check if value is `null`, string `'null'` (case-insensitive), or empty string.

```typescript
import { isNull } from '@zintrust/core';

isNull(null); // true
isNull('null'); // true
isNull('NULL'); // true
isNull(''); // true
isNull(undefined); // false

if (isNull(value)) {
  setDefault();
}
```

### `isUndefined(value): boolean`

Check if value is `undefined`.

```typescript
import { isUndefined } from '@zintrust/core';

isUndefined(undefined); // true
isUndefined(null); // false
isUndefined(''); // false

if (isUndefined(optional)) {
  optional = 'default';
}
```

### `isUndefinedOrNull(value): boolean`

Check if value is either `undefined` or satisfies `isNull()`.

```typescript
import { isUndefinedOrNull } from '@zintrust/core';

isUndefinedOrNull(null); // true
isUndefinedOrNull(undefined); // true
isUndefinedOrNull('null'); // true
isUndefinedOrNull(''); // true
isUndefinedOrNull(0); // false

if (isUndefinedOrNull(val)) {
  return 'N/A';
}
```

---

## Boolean Helpers

These functions handle boolean checks with extended string support.

### `isBoolean(value, allowString?): value is boolean | string`

Check whether value is a boolean primitive.

- **Overload 1:** `isBoolean(value)` → `value is boolean`
- **Overload 2:** `isBoolean(value, true)` → `value is boolean | string`

```typescript
import { isBoolean } from '@zintrust/core';

// Without allowString (strict boolean)
isBoolean(true); // true
isBoolean('true'); // false
isBoolean(1); // false

// With allowString = true
isBoolean('true', true); // true
isBoolean('false', true); // true
isBoolean('1', true); // true
isBoolean('0', true); // true
isBoolean('yes', true); // false (not recognized)

// Type guards
const strict: boolean | string = getValue();
if (isBoolean(strict)) {
  // TypeScript knows strict is boolean
  console.log(!strict);
}

const flexible: boolean | string = getValue();
if (isBoolean(flexible, true)) {
  // TypeScript knows flexible is boolean | string
  const result = flexible === 'true' || flexible === true;
}
```

### `isBooleanString(value): boolean`

Check if value is a string representation of a boolean (true/false/1/0).

```typescript
import { isBooleanString } from '@zintrust/core';

isBooleanString('true'); // true
isBooleanString('FALSE'); // true
isBooleanString('1'); // true
isBooleanString('0'); // true
isBooleanString(true); // false (not a string)
isBooleanString('yes'); // false

if (isBooleanString(envValue)) {
  const enabled = envValue.toLowerCase() === 'true' || envValue === '1';
}
```

---

## Numeric Checks

These functions validate numbers and numeric strings with optional bounds.

### `isNumeric(value): boolean`

Check if value is a valid number or numeric string.

```typescript
import { isNumeric } from '@zintrust/core';

isNumeric(123); // true
isNumeric(123.45); // true
isNumeric('123'); // true
isNumeric('-123.45'); // true
isNumeric('  '); // false (empty after trim)
isNumeric('abc'); // false

const price = getUserInput();
if (isNumeric(price)) {
  const amount = Number(price);
}
```

### `isInt(value, allowString?, conditions?): value is number | string`

Check if value is an integer with optional bounds.

- **Overload 1:** `isInt(value)` → `value is number`
- **Overload 2:** `isInt(value, true)` → `value is number | string`

```typescript
import { isInt } from '@zintrust/core';

// Basic integer check
isInt(42); // true
isInt(42.0); // true (integer represented as float)
isInt(42.5); // false

// Allow string integers
isInt('42', true); // true
isInt('-123', true); // true
isInt('42.5', true); // false

// With bounds
isInt(5, false, { min: 0, max: 10 }); // true
isInt(15, false, { min: 0, max: 10 }); // false
isInt('-5', true, { min: -10, max: 0 }); // true

const age = getUserAge();
if (isInt(age, true, { min: 0, max: 150 })) {
  saveAge(Number(age));
}
```

### `isFloat(value, allowString?, conditions?): value is number | string`

Check if value is a float (finite number) with optional bounds.

- **Overload 1:** `isFloat(value)` → `value is number`
- **Overload 2:** `isFloat(value, true)` → `value is number | string`

```typescript
import { isFloat } from '@zintrust/core';

// Basic float check
isFloat(3.14); // true
isFloat(3); // true (integers are valid floats)
isFloat(Infinity); // false

// Allow string floats
isFloat('3.14', true); // true
isFloat('-3.14', true); // true
isFloat('3', true); // true

// With bounds
isFloat(5.5, false, { min: 0, max: 10 }); // true
isFloat(15.5, false, { min: 0, max: 10 }); // false

const rating = getUserRating();
if (isFloat(rating, true, { min: 0, max: 5 })) {
  saveRating(Number(rating));
}
```

### `isIntString(value, conditions?): boolean`

Check if value is a valid integer string (shorthand for `isInt(value, true, conditions)`).

```typescript
import { isIntString } from '@zintrust/core';

isIntString('42'); // true
isIntString('-5', { min: -10 }); // true
isIntString('42x'); // false
```

### `isFloatString(value, conditions?): boolean`

Check if value is a valid float string (shorthand for `isFloat(value, true, conditions)`).

```typescript
import { isFloatString } from '@zintrust/core';

isFloatString('3.14'); // true
isFloatString('3'); // true
isFloatString('3.14', { min: 0 }); // true
```

---

## String / Format Checks

These functions validate specific string formats.

### `isEmail(value): boolean`

Check if value is a valid email string.

```typescript
import { isEmail } from '@zintrust/core';

isEmail('user@example.com'); // true
isEmail('me@domain.co.uk'); // true
isEmail('invalid@localhost'); // false
isEmail('no-at-sign.com'); // false

const email = form.email as unknown;
if (isEmail(email)) {
  sendConfirmation(email);
}
```

### `isUrl(value): boolean`

Check if value is a valid URL string (http/https only).

```typescript
import { isUrl } from '@zintrust/core';

isUrl('http://example.com'); // true
isUrl('https://example.com/path'); // true
isUrl('ftp://example.com'); // false
isUrl('not a url'); // false

const redirect = getParameter('redirect') as unknown;
if (isUrl(redirect) && redirect.startsWith('https://')) {
  window.location.href = redirect;
}
```

### `isAlpha(value): boolean`

Check if string contains only letters (A-Z, a-z).

```typescript
import { isAlpha } from '@zintrust/core';

isAlpha('hello'); // true
isAlpha('hello123'); // false
isAlpha('hello-world'); // false

if (isAlpha(name)) {
  console.log('Valid name');
}
```

### `isAlphanumeric(value): boolean`

Check if string contains only letters and numbers (no spaces/symbols).

```typescript
import { isAlphanumeric } from '@zintrust/core';

isAlphanumeric('hello123'); // true
isAlphanumeric('hello'); // true
isAlphanumeric('hello-123'); // false
isAlphanumeric('hello 123'); // false
```

### `isMatch(value, regex): boolean`

Check if string matches a regex pattern.

```typescript
import { isMatch } from '@zintrust/core';

isMatch('abc123', /\d+$/); // true (ends with digits)
isMatch('123abc', /^\d+/); // true (starts with digits)
isMatch('abc123', /^[a-z]+$/); // false

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
if (isMatch(dateString, dateRegex)) {
  processDate(dateString);
}
```

---

## Collection / Length

These functions check array/string membership and length.

### `isIn(value, array): boolean`

Check if value exists in array.

```typescript
import { isIn } from '@zintrust/core';

isIn('apple', ['apple', 'banana', 'orange']); // true
isIn('grape', ['apple', 'banana']); // false

const ALLOWED_ROLES = ['admin', 'user', 'guest'];
if (isIn(userRole, ALLOWED_ROLES)) {
  grantAccess();
}
```

### `isNotIn(value, array): boolean`

Check if value does not exist in array.

```typescript
import { isNotIn } from '@zintrust/core';

isNotIn('admin', ['user', 'guest']); // true
isNotIn('user', ['user', 'guest']); // false

const BANNED_WORDS = ['spam', 'abuse'];
if (isNotIn(userMessage, BANNED_WORDS)) {
  publishComment();
}
```

### `isLength(value, length): boolean`

Check if string or array has exact length.

```typescript
import { isLength } from '@zintrust/core';

isLength('hello', 5); // true
isLength([1, 2, 3], 3); // true
isLength('hi', 5); // false

if (isLength(code, 6)) {
  validateVerificationCode(code);
}
```

### `isMinLength(value, min): boolean`

Check if string or array has minimum length.

```typescript
import { isMinLength } from '@zintrust/core';

isMinLength('hello', 3); // true
isMinLength([1], 1); // true
isMinLength('hi', 5); // false

if (isMinLength(password, 8)) {
  console.log('Password meets minimum length');
}
```

### `isMaxLength(value, max): boolean`

Check if string or array has maximum length.

```typescript
import { isMaxLength } from '@zintrust/core';

isMaxLength('hello', 10); // true
isMaxLength([1, 2, 3], 5); // true
isMaxLength('hello world', 5); // false

if (isMaxLength(biography, 500)) {
  saveBiography(biography);
}
```

---

## Non-Empty Checks

These functions specifically check for non-empty collections and strings.

### `isNonEmptyString(value): value is string`

Check if value is a string with length > 0 (after trim).

```typescript
import { isNonEmptyString } from '@zintrust/core';

isNonEmptyString('hello'); // true
isNonEmptyString('   '); // false (whitespace only)
isNonEmptyString(''); // false
isNonEmptyString(null); // false

if (isNonEmptyString(firstName)) {
  greet(firstName);
}
```

### `isNonEmptyArray(value): value is unknown[]`

Check if value is an array with items.

```typescript
import { isNonEmptyArray } from '@zintrust/core';

isNonEmptyArray([1, 2]); // true
isNonEmptyArray([]); // false
isNonEmptyArray(null); // false

if (isNonEmptyArray(results)) {
  displayResults(results);
}
```

### `isNonEmptyObject(value): value is Record<string, unknown>`

Check if value is an object with keys.

```typescript
import { isNonEmptyObject } from '@zintrust/core';

isNonEmptyObject({ a: 1 }); // true
isNonEmptyObject({}); // false
isNonEmptyObject([]); // false

if (isNonEmptyObject(config)) {
  applyConfiguration(config);
}
```

---

## Additional Format Checks

### `isWhitespaceOnly(value): boolean`

Check if string contains only whitespace (not empty but no visible content).

```typescript
import { isWhitespaceOnly } from '@zintrust/core';

isWhitespaceOnly('   '); // true
isWhitespaceOnly('\t\n'); // true
isWhitespaceOnly('hello'); // false
isWhitespaceOnly(''); // false

const trimmed = userInput.trim();
if (!isWhitespaceOnly(userInput) && trimmed.length > 0) {
  processInput(trimmed);
}
```

### `isUUID(value): boolean`

Check if value is a valid UUID string (accepts any UUID format v1-v5).

```typescript
import { isUUID } from '@zintrust/core';

isUUID('550e8400-e29b-41d4-a716-446655440000'); // true
isUUID('550e8400-e29b-41d4-a716-44665544000'); // false
isUUID('not-a-uuid'); // false

if (isUUID(id)) {
  fetchRecord(id);
}
```

### `isJSON(value): boolean`

Check if value is a valid JSON string (parses without error).

```typescript
import { isJSON } from '@zintrust/core';

isJSON('{"a":1}'); // true
isJSON('[1,2,3]'); // true
isJSON('invalid json'); // false
isJSON('{"a": undefined}'); // false

const raw = environment.getConfig() as unknown;
if (isJSON(raw)) {
  const config = JSON.parse(raw);
}
```

### `isBase64(value): boolean`

Check if value is a valid Base64-encoded string.

```typescript
import { isBase64 } from '@zintrust/core';

isBase64('aGVsbG8='); // true
isBase64('SGVsbG8gV29ybGQ='); // true
isBase64('not@@base64'); // false
isBase64('nopadding'); // false

if (isBase64(encoded)) {
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
}
```

### `isHexColor(value): boolean`

Check if value is a valid hexadecimal color string.
Accepts `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA` formats.

```typescript
import { isHexColor } from '@zintrust/core';

isHexColor('#fff'); // true (RGB)
isHexColor('#ffffff'); // true (RRGGBB)
isHexColor('#ffff'); // true (RGBA)
isHexColor('#ffffffff'); // true (RRGGBBAA)
isHexColor('rgb(255, 0, 0)'); // false
isHexColor('not a color'); // false

if (isHexColor(userColor)) {
  applyThemeColor(userColor);
}
```

### `isSlug(value): boolean`

Check if value is a valid URL slug (lowercase alphanumeric with hyphens only).

```typescript
import { isSlug } from '@zintrust/core';

isSlug('my-blog-post'); // true
isSlug('user-profile-page'); // true
isSlug('My-Blog-Post'); // false (uppercase)
isSlug('my_blog_post'); // false (underscore)
isSlug('my blog post'); // false (spaces)

if (isSlug(urlPath)) {
  createPage(urlPath);
}
```

### `isUpperCase(value): boolean`

Check if string is all uppercase letters.

```typescript
import { isUpperCase } from '@zintrust/core';

isUpperCase('HELLO'); // true
isUpperCase('Hello'); // false
isUpperCase('hello'); // false
isUpperCase(''); // false

if (isUpperCase(code)) {
  processUppercaseCode(code);
}
```

### `isLowerCase(value): boolean`

Check if string is all lowercase letters.

```typescript
import { isLowerCase } from '@zintrust/core';

isLowerCase('hello'); // true
isLowerCase('Hello'); // false
isLowerCase('HELLO'); // false
isLowerCase(''); // false

if (isLowerCase(tag)) {
  saveTag(tag);
}
```

---

## Numeric Predicates

These functions provide simple numeric property checks.

### `isPositive(value): boolean`

Check if number is greater than 0.

```typescript
import { isPositive } from '@zintrust/core';

isPositive(5); // true
isPositive(0); // false
isPositive(-5); // false

if (isPositive(balance)) {
  console.log('Account has credit');
}
```

### `isNegative(value): boolean`

Check if number is less than 0.

```typescript
import { isNegative } from '@zintrust/core';

isNegative(-5); // true
isNegative(0); // false
isNegative(5); // false

if (isNegative(delta)) {
  console.log('Value decreased');
}
```

### `isZero(value): boolean`

Check if number equals zero.

```typescript
import { isZero } from '@zintrust/core';

isZero(0); // true
isZero(0.0); // true
isZero(-0); // true
isZero(1); // false

if (!isZero(count)) {
  processItems();
}
```

### `isEven(value): boolean`

Check if number is even (divisible by 2).

```typescript
import { isEven } from '@zintrust/core';

isEven(4); // true
isEven(5); // false
isEven(0); // true
isEven(1.5); // false (not integer)

if (isEven(index)) {
  applyAlternateStyle();
}
```

### `isOdd(value): boolean`

Check if number is odd (not divisible by 2).

```typescript
import { isOdd } from '@zintrust/core';

isOdd(5); // true
isOdd(4); // false
isOdd(0); // false
isOdd(1.5); // false (not integer)

if (isOdd(row)) {
  highlightRow();
}
```

### `isDecimal(value): boolean`

Check if number has decimal places (not an integer).

```typescript
import { isDecimal } from '@zintrust/core';

isDecimal(1.5); // true
isDecimal(1.0); // false
isDecimal(1); // false
isDecimal(0.001); // true

if (isDecimal(percentage)) {
  formatAsDecimal(percentage);
}
```

### `isBetween(value, min, max): boolean`

Check if number is between min and max (inclusive).

```typescript
import { isBetween } from '@zintrust/core';

isBetween(5, 0, 10); // true
isBetween(0, 0, 10); // true
isBetween(10, 0, 10); // true
isBetween(11, 0, 10); // false

if (isBetween(score, 0, 100)) {
  recordScore(score);
}
```

### `isDivisibleBy(value, divisor): boolean`

Check if number is divisible by divisor (remainder is 0).

```typescript
import { isDivisibleBy } from '@zintrust/core';

isDivisibleBy(10, 5); // true (10 % 5 === 0)
isDivisibleBy(10, 3); // false
isDivisibleBy(15, 5); // true
isDivisibleBy(0, 5); // true

if (isDivisibleBy(lineNumber, 10)) {
  addSeparator();
}
```

---

## Factory Export

All helpers are also exported as a frozen namespace `Helpers`:

```typescript
import { Helpers } from '@zintrust/core';

const value = getUserInput();
if (Helpers.isEmail(value)) {
  sendConfirmation(value);
}

// List of all available helpers
const allChecks = Helpers;
```

---

## Best Practices

### 1. Use Type Predicates for Narrowing

```typescript
import { isString, isInt } from '@zintrust/core';

function processValue(val: unknown) {
  if (isString(val)) {
    // TypeScript now knows val is string
    console.log(val.toUpperCase());
  } else if (isInt(val)) {
    // TypeScript now knows val is number
    console.log(val.toFixed(0));
  }
}
```

### 2. Combine Multiple Checks

```typescript
import { isNonEmptyString, isEmail } from '@zintrust/core';

function validateEmail(email: unknown): boolean {
  return isNonEmptyString(email) && isEmail(email);
}
```

### 3. Validate with Bounds

```typescript
import { isInt } from '@zintrust/core';

function isValidAge(age: unknown): boolean {
  return isInt(age, true, { min: 0, max: 150 });
}
```

### 4. Replace Error-Prone Comparisons

```typescript
// Before: Error-prone
if (value === null || value === undefined || value === '') {
  // handle empty
}

// After: Clear and maintainable
import { isUndefinedOrNull } from '@zintrust/core';
if (isUndefinedOrNull(value)) {
  // handle empty
}
```

---

## Runtime Compatibility

All helpers are designed to work in:

- ✅ Node.js (>= 20)
- ✅ Cloudflare Workers
- ✅ Browser environments (when bundled)

No external dependencies are used.
