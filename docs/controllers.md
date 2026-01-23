# Controllers

Controllers handle HTTP requests and coordinate between models, services, and responses. ZinTrust supports multiple controller patterns to fit different architectural preferences and use cases.

## Table of Contents

- [Controllers](#controllers)
  - [Table of Contents](#table-of-contents)
  - [Creating Controllers](#creating-controllers)
  - [Controller Patterns](#controller-patterns)
    - [1. Sealed Namespace (Recommended)](#1-sealed-namespace-recommended)
    - [2. Plain Object (Simplest)](#2-plain-object-simplest)
    - [3. Factory with Dependency Injection](#3-factory-with-dependency-injection)
  - [Using Models vs QueryBuilder](#using-models-vs-querybuilder)
    - [Model-Based Approach](#model-based-approach)
    - [QueryBuilder Approach](#querybuilder-approach)
    - [QueryBuilder with Complex Queries](#querybuilder-with-complex-queries)
  - [Authentication Controllers](#authentication-controllers)
  - [CRUD Operations](#crud-operations)
    - [RESTful CRUD Pattern](#restful-crud-pattern)
  - [Request Handling](#request-handling)
    - [Accessing Request Data](#accessing-request-data)
  - [Response Helpers](#response-helpers)
  - [Validation \& Sanitization](#validation--sanitization)
    - [Defense-in-Depth Security](#defense-in-depth-security)
  - [Error Handling](#error-handling)
    - [Structured Error Handling](#structured-error-handling)
  - [Best Practices](#best-practices)
    - [1. Keep Controllers Thin](#1-keep-controllers-thin)
    - [2. Use TypeScript Types](#2-use-typescript-types)
    - [3. Input Sanitization](#3-input-sanitization)
    - [4. Logging \& Monitoring](#4-logging--monitoring)
  - [Summary](#summary)

## Creating Controllers

Generate a new controller using the CLI:

```bash
zin add controller UserController
zin add controller api/ProductController
zin add controller admin/DashboardController
```

Controllers are stored in \`app/Controllers/\` and can be organized into subdirectories.

## Controller Patterns

ZinTrust supports three main controller patterns:

### 1. Sealed Namespace (Recommended)

The sealed namespace pattern uses \`Object.freeze()\` with a factory function for immutability and testability:

```typescript
import type { IRequest, IResponse } from '@zintrust/core';

export const UserController = Object.freeze({
  create(): {
    index: (req: IRequest, res: IResponse) => Promise<void>;
    show: (req: IRequest, res: IResponse) => Promise<void>;
  } {
    return {
      async index(req: IRequest, res: IResponse): Promise<void> {
        // Implementation
      },

      async show(req: IRequest, res: IResponse): Promise<void> {
        // Implementation
      },
    };
  },
});

export default UserController;
```

### 2. Plain Object (Simplest)

```typescript
import type { IRequest, IResponse } from '@zintrust/core';

export const UserController = {
  async index(req: IRequest, res: IResponse): Promise<void> {
    // Implementation
  },

  async show(req: IRequest, res: IResponse): Promise<void> {
    // Implementation
  },
};

export default UserController;
```

### 3. Factory with Dependency Injection

For controllers that need dependencies:

```typescript
import type { IRequest, IResponse } from '@zintrust/core';
import type { UserService } from '@app/Services/UserService';

export const createUserController = (userService: UserService) => ({
  async index(req: IRequest, res: IResponse): Promise<void> {
    const users = await userService.getAllUsers();
    res.json({ data: users });
  },

  async show(req: IRequest, res: IResponse): Promise<void> {
    const user = await userService.getUserById(req.params.id);
    if (!user) {
      res.setStatus(404).json({ error: 'User not found' });
      return;
    }
    res.json({ data: user });
  },
});
```

## Using Models vs QueryBuilder

ZinTrust provides two approaches for database operations: **Model-based** (ORM) and **QueryBuilder-based** (SQL builder).

### Model-Based Approach

Use models when you need:

- Object-oriented data access
- Relationships between entities
- Model observers/hooks
- Attribute accessors and mutators

```typescript
import { User } from '@app/Models/User';
import type { IRequest, IResponse } from '@zintrust/core';
import { Logger } from '@config/logger';

export const UserController = {
  /**
   * List all users (Model approach)
   */
  async index(req: IRequest, res: IResponse): Promise<void> {
    try {
      const users = await User.all();
      res.json({ data: users });
    } catch (error) {
      Logger.error('Error fetching users:', error);
      res.setStatus(500).json({ error: 'Failed to fetch users' });
    }
  },

  /**
   * Get a single user
   */
  async show(req: IRequest, res: IResponse): Promise<void> {
    try {
      const user = await User.find(req.params.id);

      if (!user) {
        res.setStatus(404).json({ error: 'User not found' });
        return;
      }

      res.json({ data: user });
    } catch (error) {
      Logger.error('Error fetching user:', error);
      res.setStatus(500).json({ error: 'Failed to fetch user' });
    }
  },

  /**
   * Create a new user
   */
  async store(req: IRequest, res: IResponse): Promise<void> {
    try {
      const { name, email, password } = req.getBody() as {
        name: string;
        email: string;
        password: string;
      };

      const user = User.create({ name, email, password });
      await user.save();

      res.setStatus(201).json({
        message: 'User created',
        data: user.toJSON(),
      });
    } catch (error) {
      Logger.error('Error creating user:', error);
      res.setStatus(500).json({ error: 'Failed to create user' });
    }
  },

  /**
   * Update a user
   */
  async update(req: IRequest, res: IResponse): Promise<void> {
    try {
      const user = await User.find(req.params.id);

      if (!user) {
        res.setStatus(404).json({ error: 'User not found' });
        return;
      }

      const { name, email } = req.getBody() as {
        name?: string;
        email?: string;
      };

      if (name) user.setAttribute('name', name);
      if (email) user.setAttribute('email', email);

      await user.save();

      res.json({
        message: 'User updated',
        data: user.toJSON(),
      });
    } catch (error) {
      Logger.error('Error updating user:', error);
      res.setStatus(500).json({ error: 'Failed to update user' });
    }
  },

  /**
   * Delete a user
   */
  async destroy(req: IRequest, res: IResponse): Promise<void> {
    try {
      const user = await User.find(req.params.id);

      if (!user) {
        res.setStatus(404).json({ error: 'User not found' });
        return;
      }

      await user.delete();

      res.json({ message: 'User deleted' });
    } catch (error) {
      Logger.error('Error deleting user:', error);
      res.setStatus(500).json({ error: 'Failed to delete user' });
    }
  },
```

### QueryBuilder Approach

Use QueryBuilder when you need:

- Direct SQL control
- Complex joins and aggregations
- Optimal performance
- Bulk operations

**Example from \`app/Controllers/UserQueryBuilderController.ts\`:**

```typescript
import { useEnsureDbConnected } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';
import { Sanitizer } from '@security/Sanitizer';
import { Schema, Validator } from '@validation/Validator';
import type { IRequest, IResponse } from '@zintrust/core';
import { Logger } from '@config/logger';

export const UserQueryBuilderController = {
  /**
   * List users (QueryBuilder approach)
   */
  async index(req: IRequest, res: IResponse): Promise<void> {
    try {
      const subject = typeof req.user?.sub === 'string' ? req.user.sub : undefined;

      if (!subject) {
        res.setStatus(401).json({ error: 'Unauthorized' });
        return;
      }

      const db = await useEnsureDbConnected();
      const users = await QueryBuilder.create('users', db)
        .select('id', 'name', 'email', 'created_at', 'updated_at')
        .where('id', '=', subject)
        .limit(1)
        .get();

      res.json({ data: users });
    } catch (error) {
      Logger.error('Error fetching users:', error);
      res.setStatus(500).json({ error: 'Failed to fetch users' });
    }
  },

  /**
   * Show a specific user
   */
  async show(req: IRequest, res: IResponse): Promise<void> {
    try {
      const db = await useEnsureDbConnected();

      // Sanitize untrusted input
      const id = Sanitizer.digitsOnly(req.params.id);

      if (!id) {
        res.setStatus(400).json({ error: 'Invalid user ID' });
        return;
      }

      const user = await QueryBuilder.create('users', db)
        .select('id', 'name', 'email', 'created_at', 'updated_at')
        .where('id', '=', id)
        .limit(1)
        .first();

      if (!user) {
        res.setStatus(404).json({ error: 'User not found' });
        return;
      }

      res.json({ data: user });
    } catch (error) {
      Logger.error('Error fetching user:', error);
      res.setStatus(500).json({ error: 'Failed to fetch user' });
    }
  },
};
```

### QueryBuilder with Complex Queries

```typescript
export const ReportController = {
  /**
   * Get sales report with aggregations
   */
  async salesReport(req: IRequest, res: IResponse): Promise<void> {
    try {
      const db = await useEnsureDbConnected();

      const report = await QueryBuilder.create('orders', db)
        .select(
          'DATE(created_at) as date',
          'COUNT(*) as total_orders',
          'SUM(total_amount) as revenue'
        )
        .where('status', '=', 'completed')
        .where('created_at', '>=', '2024-01-01')
        .groupBy('DATE(created_at)')
        .orderBy('date', 'DESC')
        .get();

      res.json({ data: report });
    } catch (error) {
      Logger.error('Error generating report:', error);
      res.setStatus(500).json({ error: 'Failed to generate report' });
    }
  },

  /**
   * Get user orders with joins
   */
  async userOrders(req: IRequest, res: IResponse): Promise<void> {
    try {
      const db = await useEnsureDbConnected();
      const userId = Sanitizer.digitsOnly(req.params.id);

      const orders = await QueryBuilder.create('orders', db)
        .select(
          'orders.id',
          'orders.total_amount',
          'orders.status',
          'orders.created_at',
          'users.name as user_name',
          'users.email as user_email'
        )
        .join('users', 'users.id = orders.user_id')
        .where('orders.user_id', '=', userId)
        .orderBy('orders.created_at', 'DESC')
        .get();

      res.json({ data: orders });
    } catch (error) {
      Logger.error('Error fetching orders:', error);
      res.setStatus(500).json({ error: 'Failed to fetch orders' });
    }
  },
};
```

## Authentication Controllers

**Example from \`app/Controllers/AuthController.ts\`:**

```typescript
import type { IRequest, IResponse } from '@zintrust/core';
import {
  Auth,
  QueryBuilder,
  useEnsureDbConnected,
  TokenRevocation,
  JwtManager,
  Logger,
} from '@zintrust/core';

export const AuthController = Object.freeze({
  create() {
    return {
      /**
       * Login with email and password
       */
      async login(req: IRequest, res: IResponse): Promise<void> {
        const { email, password } = req.getBody() as {
          email: string;
          password: string;
        };

        const ipAddress = req.getRaw().socket.remoteAddress ?? 'unknown';

        try {
          const db = await useEnsureDbConnected();

          const user = await QueryBuilder.create('users', db)
            .where('email', '=', email)
            .limit(1)
            .first();

          if (!user) {
            Logger.warn('Failed login attempt', { email, ip: ipAddress, reason: 'user_not_found' });
            return res.setStatus(401).json({ error: 'Invalid credentials' });
          }

          const passwordValid = await Auth.compare(password, user.password as string);

          if (!passwordValid) {
            Logger.warn('Failed login attempt', {
              email,
              ip: ipAddress,
              reason: 'invalid_password',
            });
            return res.setStatus(401).json({ error: 'Invalid credentials' });
          }

          const token = JwtManager.signAccessToken({
            sub: String(user.id),
            email: user.email,
          });

          Logger.info('Successful login', { userId: user.id, email, ip: ipAddress });

          res.json({
            token,
            token_type: 'Bearer',
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
            },
          });
        } catch (error) {
          Logger.error('Login failed', error);
          res.setStatus(500).json({ error: 'Login failed' });
        }
      },

      /**
       * Register a new user
       */
      async register(req: IRequest, res: IResponse): Promise<void> {
        const { name, email, password } = req.getBody() as {
          name: string;
          email: string;
          password: string;
        };

        try {
          const db = await useEnsureDbConnected();

          // Check if email exists
          const existing = await QueryBuilder.create('users', db)
            .where('email', '=', email)
            .limit(1)
            .first();

          if (existing) {
            Logger.warn('Duplicate email registration attempt', { email });
            return res.setStatus(409).json({ error: 'Email already registered' });
          }

          // Hash password
          const passwordHash = await Auth.hash(password);

          // Insert user
          await QueryBuilder.create('users', db).insert({
            name,
            email,
            password: passwordHash,
          });

          Logger.info('User registered successfully', { email });

          res.setStatus(201).json({ message: 'Registered' });
        } catch (error) {
          Logger.error('Registration failed', error);
          res.setStatus(500).json({ error: 'Registration failed' });
        }
      },

      /**
       * Logout and revoke token
       */
      async logout(req: IRequest, res: IResponse): Promise<void> {
        const authHeader = req.getHeader('authorization');
        TokenRevocation.revoke(authHeader);
        res.json({ message: 'Logged out' });
      },

      /**
       * Refresh access token
       */
      async refresh(req: IRequest, res: IResponse): Promise<void> {
        const user = req.user;

        if (!user) {
          return res.setStatus(401).json({ error: 'Unauthorized' });
        }

        const token = JwtManager.signAccessToken(user);
        res.json({ token, token_type: 'Bearer' });
      },
    };
  },
});

export default AuthController;
```

## CRUD Operations

### RESTful CRUD Pattern

```typescript
export const ProductController = {
  /**
   * GET /products - List all products
   */
  async index(req: IRequest, res: IResponse): Promise<void> {
    const db = await useEnsureDbConnected();

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const products = await QueryBuilder.create('products', db)
      .select('*')
      .limit(limit)
      .offset(offset)
      .orderBy('created_at', 'DESC')
      .get();

    const total = await QueryBuilder.create('products', db).count('*', 'total').first();

    res.json({
      data: products,
      pagination: {
        page,
        limit,
        total: total?.total || 0,
        pages: Math.ceil((total?.total || 0) / limit),
      },
    });
  },

  /**
   * GET /products/:id - Show single product
   */
  async show(req: IRequest, res: IResponse): Promise<void> {
    const product = await Product.find(req.params.id);

    if (!product) {
      res.setStatus(404).json({ error: 'Product not found' });
      return;
    }

    res.json({ data: product });
  },

  /**
   * POST /products - Create new product
   */
  async store(req: IRequest, res: IResponse): Promise<void> {
    const product = Product.create(req.getBody());
    await product.save();

    res.setStatus(201).json({
      message: 'Product created',
      data: product,
    });
  },

  /**
   * PUT /products/:id - Update product
   */
  async update(req: IRequest, res: IResponse): Promise<void> {
    const product = await Product.find(req.params.id);

    if (!product) {
      res.setStatus(404).json({ error: 'Product not found' });
      return;
    }

    product.fill(req.getBody());
    await product.save();

    res.json({ message: 'Product updated', data: product });
  },

  /**
   * DELETE /products/:id - Delete product
   */
  async destroy(req: IRequest, res: IResponse): Promise<void> {
    const product = await Product.find(req.params.id);

    if (!product) {
      res.setStatus(404).json({ error: 'Product not found' });
      return;
    }

    await product.delete();
    res.json({ message: 'Product deleted' });
  },
};
```

## Request Handling

### Accessing Request Data

```typescript
export const ExampleController = {
  async handle(req: IRequest, res: IResponse): Promise<void> {
    // Get route parameters
    const userId = req.params.id;
    const postId = req.params.postId;

    // Get query parameters
    const page = req.query.page;
    const search = req.query.q;

    // Get request body
    const body = req.getBody();

    // Get headers
    const contentType = req.getHeader('content-type');
    const authorization = req.getHeader('authorization');

    // Get authenticated user
    const user = req.user;

    // Get uploaded file
    const file = req.file('avatar');

    // Get all files
    const files = req.files('documents');
  },
};
```

## Response Helpers

```typescript
export const ExampleController = {
  async examples(req: IRequest, res: IResponse): Promise<void> {
    // JSON response
    res.json({ message: 'Success', data: { id: 1 } });

    // JSON with custom status
    res.setStatus(201).json({ message: 'Created' });

    // Error responses
    res.setStatus(400).json({ error: 'Bad Request' });
    res.setStatus(404).json({ error: 'Not Found' });
    res.setStatus(500).json({ error: 'Internal Server Error' });

    // Redirect
    res.redirect('/login');

    // Set headers
    res.setHeader('X-Custom-Header', 'value');

    // Download file
    res.download('/path/to/file.pdf');
  },
};
```

## Validation & Sanitization

### Defense-in-Depth Security

Always sanitize inputs, even after middleware validation:

```typescript
import { Sanitizer } from '@security/Sanitizer';
import { Schema, Validator } from '@validation/Validator';

export const SecureController = {
  async store(req: IRequest, res: IResponse): Promise<void> {
    try {
      const body = req.getBody() as Record<string, unknown>;

      // Layer 1: Sanitize untrusted inputs
      const name = Sanitizer.nameText(body.name);
      const email = Sanitizer.email(body.email);
      const password = Sanitizer.safePasswordChars(body.password);

      // Layer 2: Validate schema
      const schema = Schema.create()
        .required('name')
        .string('name')
        .minLength('name', 1)
        .maxLength('name', 100)
        .required('email')
        .string('email')
        .email('email')
        .required('password')
        .string('password')
        .minLength('password', 8);

      Validator.validate({ name, email, password }, schema);

      // Safe to use validated data
      const db = await useEnsureDbConnected();
      await QueryBuilder.create('users', db).insert({
        name,
        email,
        password: await Auth.hash(password),
      });

      res.setStatus(201).json({ message: 'User created' });
    } catch (error) {
      if (error.name === 'SanitizerError') {
        return res.setStatus(400).json({ error: error.message });
      }
      if (error.name === 'ValidationError') {
        return res.setStatus(422).json({ errors: error.toObject() });
      }
      Logger.error('Error creating user:', error);
      res.setStatus(500).json({ error: 'Failed to create user' });
    }
  },
};
```

## Error Handling

### Structured Error Handling

```typescript
const isValidationError = (error: unknown): error is ValidationError => {
  return error?.name === 'ValidationError' && typeof error.toObject === 'function';
};

const isSanitizerError = (error: unknown): error is SanitizerError => {
  return error?.name === 'SanitizerError';
};

export const RobustController = {
  async store(req: IRequest, res: IResponse): Promise<void> {
    try {
      // Your logic here
    } catch (error) {
      // Handle specific errors
      if (isSanitizerError(error)) {
        return res.setStatus(400).json({ error: error.message });
      }

      if (isValidationError(error)) {
        return res.setStatus(422).json({ errors: error.toObject() });
      }

      // Handle database errors
      if (error.code === 'ER_DUP_ENTRY') {
        return res.setStatus(409).json({ error: 'Duplicate entry' });
      }

      // Generic error
      Logger.error('Unexpected error:', error);
      res.setStatus(500).json({ error: 'Internal server error' });
    }
  },
};
```

## Best Practices

### 1. Keep Controllers Thin

Move business logic to services:

```typescript
// ❌ Fat Controller
export const OrderController = {
  async create(req: IRequest, res: IResponse): Promise<void> {
    // 100 lines of business logic...
  },
};

// ✅ Thin Controller
export const OrderController = {
  async create(req: IRequest, res: IResponse): Promise<void> {
    const orderData = req.getBody();
    const order = await OrderService.createOrder(orderData);
    res.setStatus(201).json({ data: order });
  },
};
```

### 2. Use TypeScript Types

```typescript
interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
}

interface UserResponse {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

export const UserController = {
  async store(req: IRequest, res: IResponse): Promise<void> {
    const data = req.getBody() as CreateUserRequest;
    // Type-safe operations
  },
};
```

### 3. Input Sanitization

Always sanitize route parameters and user inputs:

```typescript
import { Sanitizer } from '@security/Sanitizer';

export const SecureController = {
  async show(req: IRequest, res: IResponse): Promise<void> {
    // ❌ Unsafe
    const unsafeId = req.params.id;

    // ✅ Safe
    const id = Sanitizer.digitsOnly(unsafeId);

    if (!id) {
      return res.setStatus(400).json({ error: 'Invalid ID' });
    }
  },
};
```

### 4. Logging & Monitoring

```typescript
import { Logger } from '@config/logger';

export const MonitoredController = {
  async processPayment(req: IRequest, res: IResponse): Promise<void> {
    const startTime = Date.now();

    try {
      Logger.info('Processing payment', { userId: req.user?.sub });

      // Process payment

      Logger.info('Payment processed', {
        userId: req.user?.sub,
        duration: Date.now() - startTime,
      });

      res.json({ success: true });
    } catch (error) {
      Logger.error('Payment processing failed', {
        userId: req.user?.sub,
        error: error.message,
        duration: Date.now() - startTime,
      });

      res.setStatus(500).json({ error: 'Payment failed' });
    }
  },
};
```

## Summary

- **Choose the right pattern**: Use Models for ORM features, QueryBuilder for complex SQL
- **Keep controllers thin**: Delegate business logic to services
- **Validate and sanitize**: Defense-in-depth security approach
- **Handle errors gracefully**: Structured error handling with proper logging
- **Type safety**: Use TypeScript interfaces for request/response data
- **Log everything**: Track requests, errors, and performance metrics
