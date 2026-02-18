{
  "name": "{{projectSlug}}",
  "main": "./src/index.ts",
  "compatibility_date": "2025-04-21",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": true,
  "minify": false,

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
