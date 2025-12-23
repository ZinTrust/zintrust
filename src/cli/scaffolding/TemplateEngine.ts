/**
 * Template Engine
 * Handles template rendering with variable substitution
 * Sealed namespace with immutable template rendering methods
 */

export interface TemplateVariables {
  [key: string]: string | number | boolean | undefined;
}

export interface Template {
  name: string;
  description: string;
  files: TemplateFile[];
  directories: string[];
}

export interface TemplateFile {
  path: string;
  content: string;
  isTemplate?: boolean;
}

/**
 * Render template content with variables
 */
const renderTemplate = (content: string, variables: TemplateVariables): string => {
  let result = content;

  for (const [key, value] of Object.entries(variables)) {
    if (value === undefined || value === null) continue;

    const regex = new RegExp(String.raw`{{\s*${key}\s*}}`, 'g');
    result = result.replace(regex, String(value));
  }

  return result;
};

/**
 * Render file path with variables
 */
const renderTemplatePath = (path: string, variables: TemplateVariables): string => {
  return renderTemplate(path, variables);
};

/**
 * Replace template variables in content
 */
const renderTemplateContent = (content: string, variables: TemplateVariables): string => {
  return renderTemplate(content, variables);
};

/**
 * Get template variables with default values
 */
const mergeTemplateVariables = (
  custom: TemplateVariables,
  defaults: TemplateVariables
): TemplateVariables => {
  return { ...defaults, ...custom };
};

/**
 * Check if content contains template variables
 * Uses a non-backtracking pattern to prevent ReDoS vulnerability (S5852)
 * Limits variable name length to 255 characters as a practical constraint
 */
const hasTemplateVariables = (content: string): boolean => {
  return /\{\{[^}]{1,255}\}\}/.test(content);
};

/**
 * Extract variable names from content
 * Uses a non-backtracking pattern to prevent ReDoS vulnerability (S5852)
 * Limits variable name length to 255 characters as a practical constraint
 */
const extractTemplateVariables = (content: string): string[] => {
  const matches = content.match(/\{\{([^}]{1,255})\}\}/g);
  if (matches === null) return [];

  return matches
    .map((match) => match.replaceAll(/\{\{|\}\}/g, '').trim())
    .filter((v, i, arr) => arr.indexOf(v) === i); // Unique
};

/**
 * TemplateEngine namespace - sealed for immutability
 */
export const TemplateEngine = Object.freeze({
  render: renderTemplate,
  renderPath: renderTemplatePath,
  renderContent: renderTemplateContent,
  mergeVariables: mergeTemplateVariables,
  hasVariables: hasTemplateVariables,
  extractVariables: extractTemplateVariables,
});

/**
 * Built-in template definitions
 */
export const BUILT_IN_TEMPLATES: Record<string, Template> = {
  basic: {
    name: 'basic',
    description: 'Basic Zintrust application',
    directories: [
      'src',
      'app/Models',
      'app/Controllers',
      'routes',
      'tests/unit',
      'tests/integration',
      'config',
      'database/migrations',
      'database/seeders',
    ],
    files: [
      {
        path: 'package.json',
        isTemplate: true,
        content: `{
  "name": "{{projectName}}",
  "version": "1.0.0",
  "description": "{{projectDescription}}",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "test": "vitest",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "keywords": [],
  "author": "{{author}}",
  "license": "MIT",
  "dependencies": {
    "@zintrust/framework": "*"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "tsx": "^4.6.2",
    "vitest": "^1.1.0"
  }
}`,
      },
      {
        path: '.env.example',
        isTemplate: true,
        content: `NODE_ENV=development
APP_NAME={{projectName}}
APP_PORT={{port}}
APP_DEBUG=true
DB_CONNECTION=sqlite
DB_DATABASE=./database.sqlite`,
      },
      {
        path: 'tsconfig.json',
        content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./",
    "baseUrl": "./",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}`,
      },
      {
        path: '.gitignore',
        content: `# Node
node_modules/
npm-debug.log

# Build
dist/
build/
*.tsbuildinfo

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~
.DS_Store

# Tests
coverage/
.nyc_output/

# Logs
logs/
*.log

# Database
*.sqlite
*.sqlite3

# OS
.DS_Store
Thumbs.db`,
      },
      {
        path: 'README.md',
        isTemplate: true,
        content: `# {{projectName}}

{{projectDescription}}

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Development

\`\`\`bash
npm run dev          # Start development server
npm test             # Run tests
npm run build        # Build for production
npm start            # Start production server
\`\`\`

## License

MIT`,
      },
      {
        path: 'src/index.ts',
        content: `import { Application } from '@zintrust/framework';

const app = new Application(__dirname);

app.boot();

export default app;`,
      },
      {
        path: 'routes/api.ts',
        content: `import { Router } from '@zintrust/routing';

const registerRoutes = (router: Router): void => {
  router.get('/', async (req, res) => {
    res.json({ message: 'Welcome to {{projectName}}!' });
  });

  router.get('/health', async (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });
}`,
      },
    ],
  },
  api: {
    name: 'api',
    description: 'RESTful API with microservices support',
    directories: [
      'src',
      'app/Models',
      'app/Controllers',
      'app/Services',
      'routes',
      'tests/unit',
      'tests/integration',
      'config',
      'database/migrations',
      'database/seeders',
      'services',
    ],
    files: [
      {
        path: 'package.json',
        isTemplate: true,
        content: `{
  "name": "{{projectName}}",
  "version": "1.0.0",
  "description": "RESTful API {{projectDescription}}",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "test": "vitest",
    "build": "tsc",
    "start": "node dist/index.js",
    "microservices:generate": "zintrust microservices:generate"
  },
  "keywords": ["api", "rest"],
  "author": "{{author}}",
  "license": "MIT",
  "dependencies": {
    "@zintrust/framework": "*"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "tsx": "^4.6.2",
    "vitest": "^1.1.0"
  }
}`,
      },
      {
        path: '.env.example',
        isTemplate: true,
        content: `NODE_ENV=development
APP_NAME={{projectName}}
APP_PORT={{port}}
APP_DEBUG=true
DB_CONNECTION=postgres
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE={{projectName}}_db
DB_USERNAME=postgres
DB_PASSWORD=password`,
      },
      {
        path: 'README.md',
        isTemplate: true,
        content: `# {{projectName}} API

{{projectDescription}}

REST API built with Zintrust framework.

## Features

- Full REST API support
- PostgreSQL database
- User authentication
- Comprehensive testing
- Microservices ready

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

API will be available at http://localhost:{{port}}

## API Documentation

### Health Check
\`GET /health\`

### Users
\`GET /api/users\` - List all users
\`POST /api/users\` - Create user
\`GET /api/users/:id\` - Get user
\`PUT /api/users/:id\` - Update user
\`DELETE /api/users/:id\` - Delete user

## Development

\`\`\`bash
npm run dev          # Start development server
npm test             # Run tests
npm run build        # Build for production
npm start            # Start production server
\`\`\`

## License

MIT`,
      },
      {
        path: 'src/index.ts',
        content: `import { Application } from '@zintrust/framework';

const app = new Application(__dirname);

// Load middleware, routes, etc.
app.boot();

export default app;`,
      },
      {
        path: 'routes/api.ts',
        content: `import { Router } from '@zintrust/routing';

const registerApiRoutes = (router: Router): void => {
  router.group({ prefix: '/api/v1' }, (r) => {
    // Health check
    r.get('/health', async (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // User routes would go here
    r.get('/users', async (req, res) => {
      res.json({ users: [] });
    });
  });
}`,
      },
    ],
  },
};
