# Project Structure

Generic template — role-based names only; no project-specific identifiers.

```
project-root/
│
├── .github/
│   ├── copilot-instructions.md        # repo-level AI agent rules
│   └── skills/
│       ├── deployment-records/
│       │   └── SKILL.md               # deployment skill guide
│       └── framework-development/
│           └── SKILL.md               # framework coding skill guide
│
├── .zintrust/                         # framework local state
├── .zintrust.json                     # deployment env group source of truth
├── .wrangler/                         # worker runtime local cache
│
├── wrangler.jsonc                     # root worker config
├── wrangler.worker.jsonc              # container worker config
├── wrangler.worker.local.jsonc        # local container worker config
├── wrangler.containers-proxy.jsonc    # proxy worker config
├── wrangler.containers-proxy.local.jsonc
├── wrangler.<proxy-a>-proxy.local.jsonc  # per-proxy local config (one per proxy)
├── wrangler.<proxy-b>-proxy.local.jsonc
├── wrangler.<proxy-c>-proxy.local.jsonc
│
├── Dockerfile                         # production image
├── Dockerfile.worker.local            # local worker container image
├── Dockerfile.<proxy-a>.local         # per-proxy local image (one per proxy)
├── Dockerfile.<proxy-b>.local
├── Dockerfile.<proxy-c>.local
├── Dockerfile.workers                 # multi-worker compose image
│
├── docker-compose.worker.yml          # single worker compose
├── docker-compose.workers.yml         # all workers compose
├── docker-compose.proxy.yml           # proxy gateway compose
├── docker-compose.<proxy-a>.yml       # per-proxy compose (one per proxy)
├── docker-compose.<proxy-b>.yml
│
├── package.json
├── tsconfig.json
├── eslint.config.js
├── vitest.config.ts
├── .prettierrc.json
├── .gitignore
├── .env                               # local env (not committed)
├── .dev.vars                          # Cloudflare local dev vars
├── AGENTS.md                          # workspace agent rules pointer
├── README.md
│
├── app/                               # shared application layer (monolith surface)
│   ├── Controllers/                   # shared route controllers
│   │   ├── PublicController.ts        # unauthenticated public endpoints
│   │   ├── GatewayController.ts       # payment/third-party gateway endpoints
│   │   ├── BroadcastController.ts     # broadcast management endpoints
│   │   └── ...                        # other shared controllers
│   │
│   ├── Gate/                          # gateway adapters (external providers)
│   │   ├── index.ts                   # gate barrel / selector
│   │   ├── provider-a-gateway.ts      # provider A adapter
│   │   └── provider-b-gateway.ts      # provider B adapter
│   │
│   ├── Middleware/                    # shared request middleware
│   │   ├── auth.ts                    # authentication middleware
│   │   ├── legacy.ts                  # legacy-compat middleware
│   │   ├── register.ts                # middleware registration
│   │   └── AuthFailureResponder.ts    # auth failure handler
│   │
│   ├── Models/                        # ORM model definitions (shared)
│   │   ├── model.types.ts             # shared model interfaces and row types
│   │   ├── User.ts
│   │   ├── Profile.ts
│   │   ├── App.ts                     # API app / tenant model
│   │   ├── Transaction.ts
│   │   ├── Deposit.ts
│   │   ├── Withdraw.ts
│   │   ├── Asset.ts                   # asset / hold models
│   │   ├── Beneficiary.ts             # beneficiary / saved-account model
│   │   ├── PaymentAccount.ts          # merchant / VA account model
│   │   ├── Token.ts                   # API token model
│   │   ├── FileUpload.ts
│   │   ├── Tag.ts                     # taggable / polymorphic tag
│   │   ├── Voucher.ts
│   │   ├── Counter.ts
│   │   ├── Push.ts                    # push notification registration
│   │   ├── ReferenceData.ts           # reference tables (country, state, city)
│   │   ├── DomainA.ts                 # domain A primary model
│   │   ├── DomainATransaction.ts
│   │   ├── DomainABar.ts              # physical / inventory model for domain A
│   │   ├── DomainABarAddress.ts
│   │   ├── DomainABarCollection.ts
│   │   ├── DomainAStockTransaction.ts
│   │   ├── DomainB.ts                 # domain B primary model
│   │   ├── DomainBBeneficiary.ts
│   │   ├── DomainBTransaction.ts
│   │   ├── CryptoToken.ts
│   │   ├── CryptoAddress.ts
│   │   └── ...
│   │
│   ├── Schedules/                     # cron / scheduled job definitions
│   │   └── index.ts
│   │
│   ├── Toolkit/                       # shared tool adapters
│   │   ├── Broadcast/                 # broadcast channel adapters
│   │   ├── Gateway/                   # payment gateway helpers
│   │   ├── Mail/                      # email rendering and sending helpers
│   │   │   ├── renderBrandedEmail.ts
│   │   │   └── sendWelcomeEmail.ts
│   │   └── Notification/              # push / in-app notification helpers
│   │
│   ├── Types/                         # shared TypeScript type declarations
│   │
│   ├── Utility/                       # shared utility helpers
│   │   ├── index.ts                   # barrel / hashid helpers
│   │   ├── legacy-cleaners.ts         # value sanitizers and legacy cleaners
│   │   ├── legacy-crypter.ts          # encryption/decryption helpers
│   │   ├── legacy-market-data.ts      # market rate helpers
│   │   ├── legacy-reference-data.ts   # reference data loaders
│   │   ├── legacy-settings.ts         # app settings helpers
│   │   ├── legacy-user-values.ts      # user attribute helpers
│   │   ├── legacy-request-client.ts   # external HTTP request helper
│   │   ├── legacy-permissions.ts      # permission/role helpers
│   │   ├── legacy-payload.ts          # response payload builders
│   │   ├── legacy-list-mapper.ts      # list/collection mappers
│   │   └── route-map.ts               # route inventory map
│   │
│   └── Workers/                       # shared background worker classes
│       ├── DomainADispatchWorker.ts
│       ├── DomainAMutationWorker.ts
│       ├── DomainBDispatchWorker.ts
│       ├── DomainBMutationWorker.ts
│       ├── CryptoProcessorWorker.ts
│       ├── CryptoSenderWorker.ts
│       ├── CryptoAddressWorker.ts
│       ├── CryptoLocalWorker.ts
│       ├── CryptoCreditorWorker.ts
│       ├── AssetHoldWorker.ts
│       ├── GeneralProcessorWorker.ts
│       ├── NotificationWorker.ts
│       └── ReceiverWorker.ts
│
├── config/                            # framework service configs
│   ├── database.ts
│   ├── cache.ts
│   ├── queue.ts
│   ├── mail.ts
│   ├── broadcast.ts
│   ├── notification.ts
│   ├── storage.ts
│   ├── middleware.ts
│   ├── trace.ts
│   └── logging/
│
├── database/                          # database artefacts
│   ├── migrations/                    # D1 / SQL migration files
│   ├── seeders/                       # seed data files
│   └── factories/                     # model factory definitions
│
├── routes/                            # root route files
│   ├── api.ts                         # root API mount / microservice delegation
│   ├── broadcast.ts                   # broadcast route
│   └── storage.ts                     # file storage route
│
├── src/                               # framework runtime and service layer
│   ├── index.ts                       # worker entry point
│   ├── zintrust.runtime.ts            # production runtime config
│   ├── zintrust.runtime.wg.ts         # watched-mode runtime config
│   ├── zintrust.plugins.ts            # production plugin registration
│   ├── zintrust.plugins.wg.ts         # watched-mode plugin registration
│   ├── zintrust.workers.ts            # multi-worker entry
│   ├── worker-container.js            # container worker entry
│   ├── containers-proxy.ts            # proxy worker entry
│   │
│   ├── boot/
│   │   └── bootstrap.ts               # application bootstrapper
│   │
│   ├── bootstrap/                     # microservice manifest and worker boot
│   │   ├── service-manifest.ts        # microservice registry
│   │   ├── domain-a-workers.ts        # domain A legacy worker boot
│   │   └── notification-worker.ts     # notification worker boot
│   │
│   ├── jobs/                          # shared job entry stubs
│   │   └── domain-a-jobs.ts
│   │
│   ├── plugins/                       # framework plugins
│   │   ├── plugin-a/
│   │   └── plugin-b/
│   │
│   ├── proxy/                         # proxy gateway source
│   │   └── d1/                        # D1 HTTP proxy handler
│   │
│   ├── runtime/
│   │   └── plugins/                   # runtime-scoped plugin overrides
│   │
│   ├── tools/
│   │   └── mail/                      # mail tool helpers
│   │
│   └── services/                      # microservice layer
│       └── <namespace>/               # service namespace (e.g. org or product name)
│           │
│           ├── <service-a>/           # one folder per microservice
│           │   ├── service.config.json    # ZinTrust service descriptor
│           │   ├── wrangler.jsonc         # service worker config
│           │   ├── tsconfig.json
│           │   ├── .dev.vars              # service-local dev env
│           │   ├── .env
│           │   ├── README.md
│           │   │
│           │   ├── app/                   # service application layer
│           │   │   ├── Controllers/       # service-local route controllers
│           │   │   ├── Helper/            # service-local helper functions
│           │   │   ├── Utility/           # service-local utility modules
│           │   │   └── job/               # service-local job handlers
│           │   │
│           │   ├── routes/
│           │   │   └── api.ts             # service route definitions
│           │   │
│           │   └── src/                   # service worker / runtime internals
│           │       ├── index.ts           # service entry point
│           │       ├── controllers/       # inner service controllers
│           │       ├── middleware/        # service middleware
│           │       ├── models/            # service-local models (if needed)
│           │       ├── services/          # service-local service classes
│           │       ├── factories/         # service-local factories
│           │       └── migrations/        # service-local migrations (if needed)
│           │
│           ├── <service-b>/           # (same layout as service-a)
│           ├── <service-c>/
│           └── ...
│
├── flow/                              # business flow documentation (Markdown)
│   ├── domain-a/                      # flow docs for domain A
│   ├── domain-b/                      # flow docs for domain B
│   └── domain-c/
│
├── docs/                              # all project documentation
│   ├── change-log.md                  # running change log (required)
│   ├── project-structure.md           # this file
│   ├── service-foundation-*.md        # per-service foundation notes
│   ├── zintrust-core-*.md             # upstream core implementation briefs
│   └── ...
│
├── http/                              # .http fixture files for manual testing
├── json/                              # JSON fixtures and payloads
├── requests/                          # raw request samples
│
├── plan/                              # execution planning
│   ├── next/                          # active service work plans
│   ├── done/                          # completed work plans
│   └── core/                          # ZinTrust core-facing plans only
│
├── tests/
│   ├── unit/
│   └── integration/
│
├── scripts/                           # build and dev automation scripts
│   ├── bin/
│   ├── seed-db.ts
│   ├── build-db-registry.mjs
│   ├── kill-port.mjs
│   └── open-local-terminals.mjs
│
├── patches/                           # patch files for dependencies
├── tasks/                             # task definitions
├── dev/                               # local dev diagnostic scripts
├── public/                            # public static assets
├── storage/                           # local file storage
├── logs/                              # local log output
└── tmp/                               # temporary files
```

## Layer Responsibilities

| Layer | Path | Role |
|---|---|---|
| **Shared app** | `app/` | Models, shared controllers, middleware, workers, utilities used by all services |
| **Config** | `config/` | Framework service configuration (db, cache, queue, mail, etc.) |
| **Database** | `database/` | Migrations, seeders, factories for the root database |
| **Routes** | `routes/` | Root route file that mounts microservice prefixes and any true root routes |
| **Runtime** | `src/` | Worker entry points, bootstrap, plugin registration, proxy handlers |
| **Services** | `src/services/<namespace>/` | One folder per microservice — self-contained routes, controllers, utilities, jobs |
| **Flow docs** | `flow/` | Confirmed business-flow Markdown, kept in sync with code |
| **Docs** | `docs/` | All project documentation; `change-log.md` is required and updated with every change |
| **Plans** | `plan/` | Execution plans (`next/` active, `done/` complete, `core/` upstream only) |
| **Tests** | `tests/` | Unit and integration test suites |

## Microservice Internal Layout

Every microservice under `src/services/<namespace>/<service>/` follows this internal contract:

```
<service>/
├── service.config.json   # ZinTrust service descriptor (name, port, health path)
├── wrangler.jsonc        # service-level Cloudflare Worker config with alias map
├── tsconfig.json         # service-level TS config extending root
├── .dev.vars             # service-level local env overrides
│
├── app/
│   ├── Controllers/      # route handler classes for this service
│   ├── Helper/           # shared helper functions local to this service
│   ├── Utility/          # business-logic utilities local to this service
│   └── job/              # queue job handler functions
│
├── routes/
│   └── api.ts            # route registration; no business logic in this file
│
└── src/
    ├── index.ts          # ZinTrust MicroserviceBootstrap entry point
    ├── controllers/      # inner controllers used by the framework runtime
    ├── middleware/        # service-scoped middleware registration
    ├── models/           # service-local ORM models (only when not shared)
    ├── services/         # service class implementations
    ├── factories/        # test factories for this service
    └── migrations/       # service-local schema migrations (only when needed)
```

## Key Conventions

- **Alias imports** — use `@app/*`, `@routes/*`, `@runtime-config/*`, and service-local aliases declared in `wrangler.jsonc`; never use long relative `../../` chains.
- **Route file purity** — `routes/api.ts` registers routes only; all logic lives in `Controllers/`.
- **Model ownership** — encrypt/decrypt, hashid, JSON cast behavior lives inside model accessors/mutators; service code works with plain values.
- **Missing-value checks** — prefer `isNullish(...)` for strict TS narrowing; prefer `isUndefinedOrNull(...)` for broad legacy compatibility; combine both at nullable control-flow checkpoints.
- **Docs requirement** — every meaningful change updates `docs/change-log.md`; deeper changes get a dedicated `docs/*.md` file.
- **Flow docs** — `flow/<domain>/` Markdown is updated in the same turn as code changes to the matching domain logic.
