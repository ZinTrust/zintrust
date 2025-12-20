# Validation

Zintrust provides a powerful validation system to ensure your application only processes valid data.

## Basic Validation

```typescript
import { Validator } from '@validation/Validator';

const data = req.body;
const rules = {
  name: 'required|string|min:3',
  email: 'required|email|unique:users,email',
  age: 'integer|min:18',
};

const validator = new Validator(data, rules);

if (validator.fails()) {
  return res.status(422).json({ errors: validator.errors() });
}
```

## Available Rules

- `required`: The field must be present and not empty.
- `string`: The field must be a string.
- `integer`: The field must be an integer.
- `email`: The field must be a valid email address.
- `min:value`: The field must have a minimum size/value.
- `max:value`: The field must have a maximum size/value.
- `unique:table,column`: The field must be unique in the database.
- `confirmed`: The field must match another field named `field_confirmation`.

## Custom Validation Rules

You can define custom validation rules in your application:

```typescript
Validator.extend(
  'uppercase',
  (value) => {
    return value === value.toUpperCase();
  },
  'The :attribute must be uppercase.'
);
```
