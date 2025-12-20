# Deployment

Deploying a Zintrust application is straightforward thanks to its zero-dependency core and standard Node.js architecture.

## Prerequisites

- Node.js 18 or higher.
- A supported database (SQLite, MySQL, or PostgreSQL).

## Build Process

First, compile your TypeScript code to JavaScript:

```bash
npm run build
```

This will generate the production-ready files in the `dist/` directory.

## Environment Configuration

Ensure your `.env` file is properly configured for production:

```env
APP_ENV=production
APP_DEBUG=false
DB_CONNECTION=mysql
DB_HOST=your-db-host
```

## Running the Server

You can start the server using `node`:

```bash
node dist/src/bootstrap.js
```

For production, it's recommended to use a process manager like **PM2**:

```bash
pm2 start dist/src/bootstrap.js --name zintrust-app
```

## Migrations

Run your migrations on the production database:

```bash
zin migrate --force
```

## Static Assets

If your application serves static assets, it's recommended to use a reverse proxy like **Nginx** to serve them directly for better performance.
