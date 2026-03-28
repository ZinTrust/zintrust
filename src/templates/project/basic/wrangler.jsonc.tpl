{
  "name": "{{projectSlug}}",
  "main": "./src/index.ts",
  "compatibility_date": "2025-04-21",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": true,
  "minify": false,
  "alias": {
    "@routes/api.ts": "./routes/api.ts",
    "../zintrust.runtime.wg.js": "./src/zintrust.runtime.wg.ts",
    "../zintrust.plugins.wg.js": "./src/zintrust.plugins.wg.ts",
    "@runtime-config/broadcast.ts": "./config/broadcast.ts",
    "@runtime-config/cache.ts": "./config/cache.ts",
    "@runtime-config/database.ts": "./config/database.ts",
    "@runtime-config/mail.ts": "./config/mail.ts",
    "@runtime-config/storage.ts": "./config/storage.ts",
    "@runtime-config/queue.ts": "./config/queue.ts",
    "@runtime-config/notification.ts": "./config/notification.ts",
    "@runtime-config/middleware.ts": "./config/middleware.ts"
  },

  "vars": {
    "ENVIRONMENT": "development"
  },

  "d1_databases": [
    {
      "binding": "ZIN_DB",
      "database_name": "{{projectSlug}}-db",
      "database_id": "REPLACE_ME",
      "migrations_dir": "database/migrations/d1"
    }
  ],

  "kv_namespaces": [
    {
      "binding": "ZIN_KV",
      "id": "REPLACE_ME"
    }
  ]
}
