# Coverage Gap Implementation Guide

## Quick Reference: Top 15 Files Needing Tests

### 🔴 CRITICAL - Runtime Adapters (0-10% coverage)

#### 1. NodeServerAdapter.ts (5.7%)

**Location:** `src/runtime/adapters/NodeServerAdapter.ts`
**Lines:** 80 total | 75 uncovered
**Functions:** 35 total | 33 uncovered

**Key Uncovered Code Paths:**

- Server initialization and HTTP listener setup (lines 30-45)
- Request routing to handler pipeline (lines 50-65)
- Response writing and streaming (lines 70-85)
- Error handling and server shutdown (lines 110-125)
- Middleware chain execution for Node.js context (lines 140-155)

**Recommended Test Structure:**

```typescript
// tests/unit/runtime-adapters/NodeServerAdapter.test.ts
describe('NodeServerAdapter', () => {
  describe('Server Initialization', () => {
    it('should create HTTP server with correct port');
    it('should handle port conflicts');
    it('should set up request listeners');
    it('should enable graceful shutdown');
    it('should handle invalid configuration');
  });

  describe('Request Handling', () => {
    it('should parse incoming requests');
    it('should route to appropriate handler');
    it('should pass through middleware chain');
    it('should set response headers correctly');
    it('should handle streaming responses');
  });

  describe('Error Handling', () => {
    it('should catch server errors');
    it('should log errors properly');
    it('should return error responses to client');
    it('should recover from unexpected errors');
  });
});
```

**Effort Estimate:** 40-50 tests, 20-25 hours

---

#### 2. DenoAdapter.ts (5.8%)

**Location:** `src/runtime/adapters/DenoAdapter.ts`
**Lines:** 61 total | 57 uncovered
**Functions:** 29 total | 27 uncovered

**Key Uncovered Code Paths:**

- Deno module import resolution (lines 31-38)
- Permission request handling (lines 48-65)
- Response handling with Deno-specific types (lines 75-90)
- Signal handling for Deno runtime (lines 110-125)

**Test Categories:**

- Module resolution in Deno environment
- Permission prompt handling
- Deno-specific type transformations
- Process signal handling
- Error recovery specific to Deno

**Effort Estimate:** 35-40 tests, 18-22 hours

---

#### 3. CloudflareAdapter.ts (8.6%)

**Location:** `src/runtime/adapters/CloudflareAdapter.ts`
**Lines:** 56 total | 51 uncovered
**Functions:** 25 total | 22 uncovered

**Key Uncovered Code Paths:**

- Worker environment initialization (lines 32-40)
- Environment variable/KV binding access (lines 49-65)
- Cache API integration (lines 75-85)
- Request/response transformation for Cloudflare (lines 93-110)

**Test Categories:**

- Cloudflare Worker context setup
- Environment binding resolution
- KV storage operations
- Cache API interaction
- CF-specific header handling
- Error handling in Worker context

**Effort Estimate:** 30-35 tests, 15-18 hours

---

### 🟠 HIGH PRIORITY - Microservices & Database (25-60% coverage)

#### 4. ServiceHealthMonitor.ts (26.0%)

**Location:** `src/microservices/ServiceHealthMonitor.ts`
**Lines:** 118 total | 89 uncovered
**Functions:** 35 total | 25 uncovered

**Key Uncovered Code Paths:**

- Dependency health check execution (lines 120-140)
- Retry logic with exponential backoff (lines 153-175)
- Timeout enforcement (lines 180-200)
- Circuit breaker state transitions (lines 215-250)
- Recovery trigger logic (lines 260-280)

**Critical Test Scenarios:**

- Health check success and failures
- Retry behavior on transient failures
- Timeout during health checks
- Circuit breaker open/closed states
- Recovery after service restoration
- Multiple dependency monitoring
- Alert generation
- Metric collection

**Effort Estimate:** 30-35 tests, 18-22 hours

---

#### 5. PostgresAdapter.ts (38.0%)

**Location:** `src/microservices/PostgresAdapter.ts`
**Lines:** 135 total | 88 uncovered
**Functions:** 35 total | 24 uncovered

**Key Uncovered Code Paths:**

- Connection pool management (lines 110-130)
- Query execution with parameter binding (lines 140-160)
- Transaction commit/rollback (lines 170-195)
- Connection error handling and reconnection (lines 210-240)
- Batch operations (lines 250-270)

**Critical Test Scenarios:**

- Successful connections
- Connection pool exhaustion
- Query execution (CRUD operations)
- Parameter injection handling
- Transaction boundaries
- Connection failures and recovery
- Pool timeout scenarios
- Prepared statements
- Large result sets

**Effort Estimate:** 35-40 tests, 22-28 hours

---

#### 6. Model.ts (52.0%)

**Location:** `src/orm/Model.ts`
**Lines:** 110 total | 52 uncovered
**Functions:** 34 total | 13 uncovered

**Key Uncovered Code Paths:**

- Relationship eager loading (lines 149-175)
- Relationship lazy loading (lines 193-215)
- Query scope application (lines 230-250)
- Custom accessor/mutator execution (lines 260-275)
- Data transformation during serialization (lines 290-310)

**Critical Test Scenarios:**

- Model instantiation and hydration
- Has-many relationship loading
- Has-one relationship loading
- Belongs-to relationship loading
- Lazy loading on access
- Scope application in queries
- Custom getters/setters
- JSON serialization
- Validation before save
- Dirty attribute tracking

**Effort Estimate:** 25-30 tests, 15-20 hours

---

#### 7. ConnectionManager.ts (59.0%)

**Location:** `src/orm/ConnectionManager.ts`
**Lines:** 139 total | 53 uncovered
**Functions:** 49 total | 19 uncovered

**Key Uncovered Code Paths:**

- Connection pool initialization (lines 85-105)
- Connection state lifecycle management (lines 115-135)
- Failover to replica logic (lines 185-210)
- Connection timeout and retry (lines 220-245)
- Multiple named connection support (lines 260-285)

**Critical Test Scenarios:**

- Pool initialization with options
- Connection acquisition and release
- Connection state transitions
- Replica failover
- Reconnection on timeout
- Multiple named connections
- Connection validation
- Idle connection cleanup
- Pool size limits

**Effort Estimate:** 20-25 tests, 12-18 hours

---

### 🟡 HIGH PRIORITY - CLI & Auth (38-65% coverage)

#### 8. AddCommand.ts (53.5%)

**Location:** `src/cli/commands/AddCommand.ts`
**Lines:** 353 total | 148 uncovered
**Functions:** 52 total | 25 uncovered | 94 branches uncovered

**Key Uncovered Code Paths:**

- Service scaffolding (lines 160-180)
- Feature scaffolding (lines 190-210)
- Migration scaffolding (lines 220-240)
- Model scaffolding (lines 250-270)
- Route scaffolding (lines 280-300)
- Template file validation (lines 310-330)
- File naming and validation (lines 340-360)

**Critical Test Scenarios:**
For each type (service, feature, migration, model, controller, routes, factory, seeder):

- Valid file creation
- Duplicate file handling
- Invalid naming validation
- Directory structure creation
- Template variable substitution
- Permission errors
- Disk space errors
- Special characters in names
- Reserved word checking
- Namespace handling

**Effort Estimate:** 40-50 tests, 24-32 hours

---

#### 9. ServiceAuthMiddleware.ts (53.8%)

**Location:** `src/microservices/ServiceAuthMiddleware.ts`
**Lines:** 107 total | 44 uncovered
**Functions:** 24 total | 8 uncovered

**Key Uncovered Code Paths:**

- Token extraction from headers (lines 42-65)
- Token validation and verification (lines 85-115)
- Permission checking logic (lines 130-160)
- Service-to-service authentication (lines 180-210)
- Unauthorized error formatting (lines 220-245)

**Critical Test Scenarios:**

- Valid token acceptance
- Invalid token rejection
- Expired token handling
- Malformed token handling
- Missing token handling
- Service permission verification
- Cross-service calls
- Token refresh logic
- Error response formatting
- Logging of auth failures

**Effort Estimate:** 25-30 tests, 15-20 hours

---

#### 10. LogsCommand.ts (38.3%)

**Location:** `src/cli/commands/LogsCommand.ts`
**Lines:** 108 total | 56 uncovered
**Functions:** 18 total | 11 uncovered

**Key Uncovered Code Paths:**

- Log file parsing (lines 33-48)
- Log filtering by level (lines 62-75)
- Log filtering by date range (lines 85-105)
- Search functionality (lines 110-130)
- Output formatting (lines 140-160)

**Critical Test Scenarios:**

- Parse various log formats
- Filter by log level (DEBUG, INFO, WARN, ERROR)
- Filter by date range
- Search by pattern
- Format output as table/JSON
- Handle large log files
- Handle empty logs
- Handle corrupted log entries
- Pagination of results
- Tail functionality

**Effort Estimate:** 20-25 tests, 12-18 hours

---

### 🟢 MEDIUM PRIORITY - Utilities & Routing (58-78% coverage)

#### 11. RuntimeAdapter.ts (58.6%)

**Location:** `src/runtime/RuntimeAdapter.ts`
**Lines:** 46 total | 19 uncovered
**Functions:** 21 total | 9 uncovered

**Key Uncovered Functions:**

- Runtime type detection (lines 136-150)
- Mock object creation (lines 142-165)
- Adapter initialization (lines 148-175)
- Edge case detection (lines 235-260)

**Test Focus:**

- Accurately detect Node.js, Deno, Cloudflare, Lambda, Fargate
- Mock creation for different runtimes
- Error handling on unknown runtimes
- Runtime-specific configurations

**Effort Estimate:** 10-15 tests, 6-10 hours

---

#### 12. Router.ts (60.9%)

**Location:** `src/routing/Router.ts`
**Lines:** 84 total | 25 uncovered
**Branches:** 36 total | 25 uncovered (30.6% branch coverage)

**Key Uncovered Code Paths:**

- Complex route pattern matching (lines 40-65)
- Route priority handling (lines 75-95)
- Middleware execution order (lines 105-125)
- Parameter extraction (lines 135-155)
- Error handling for invalid routes (lines 165-180)

**Test Focus:**

- Wildcard route matching
- Named parameter extraction
- Route group nesting
- Middleware chain order
- Conflict resolution in route patterns
- Error responses for no match
- Method-specific routing

**Effort Estimate:** 15-20 tests, 10-15 hours

---

#### 13. ServiceBundler.ts (61.2%)

**Location:** `src/microservices/ServiceBundler.ts`
**Lines:** 120 total | 43 uncovered
**Functions:** 28 total | 6 uncovered

**Key Uncovered Code Paths:**

- Service bundle generation (lines 150-175)
- Dependency resolution (lines 185-210)
- Service metadata collection (lines 220-240)
- Bundle validation (lines 250-270)

**Test Focus:**

- Bundle creation
- Dependency graph resolution
- Circular dependency detection
- Service metadata extraction
- Bundle optimization
- Error handling for invalid services

**Effort Estimate:** 15-20 tests, 10-15 hours

---

## Summary: Implementation Roadmap

### Week 1-2: Runtime Adapters (Critical)

```
- NodeServerAdapter: 40-50 tests (20-25h)
- DenoAdapter: 35-40 tests (18-22h)
- CloudflareAdapter: 30-35 tests (15-18h)
Total: 115 tests, 55-65 hours
Expected: 5.7% → 90%+ coverage
```

### Week 3-4: Microservices & DB (High Priority)

```
- ServiceHealthMonitor: 30-35 tests (18-22h)
- PostgresAdapter: 35-40 tests (22-28h)
- Model.ts: 25-30 tests (15-20h)
- ConnectionManager: 20-25 tests (12-18h)
Total: 110 tests, 65-90 hours
Expected: 26-59% → 80%+ coverage
```

### Week 5-6: CLI & Auth (High Priority)

```
- AddCommand: 40-50 tests (24-32h)
- ServiceAuthMiddleware: 25-30 tests (15-20h)
- LogsCommand: 20-25 tests (12-18h)
Total: 85 tests, 50-70 hours
Expected: 38-54% → 75%+ coverage
```

### Week 7-8: Utilities & Polish

```
- RuntimeAdapter: 10-15 tests (6-10h)
- Router.ts: 15-20 tests (10-15h)
- ServiceBundler: 15-20 tests (10-15h)
- Configuration & misc: 20-30 tests (12-18h)
Total: 60-85 tests, 40-60 hours
Expected: 58-77% → 90%+ coverage
```

---

## Test Data & Fixtures

### Common Test Fixtures to Create

```typescript
// tests/fixtures/mocks.ts
export const mockConfig = {
  /* mock configuration */
};
export const mockRequest = {
  /* mock HTTP request */
};
export const mockResponse = {
  /* mock HTTP response */
};
export const mockDatabase = {
  /* mock database */
};
export const mockLogger = {
  /* mock logger */
};

// tests/fixtures/factories.ts
export function createMockModel() {}
export function createMockService() {}
export function createMockAdapter() {}
export function createMockConnection() {}

// tests/fixtures/data.ts
export const sampleLogs = [];
export const sampleModels = [];
export const sampleServices = [];
```

---

## CI/CD Integration

Add to your pipeline:

```bash
# Run coverage analysis
npm run test:coverage

# Fail if coverage drops below threshold
npm run test:coverage -- --coverage-threshold 82.5

# Generate coverage reports
npm run test:coverage -- --reporter=html
```

---

**Total Effort Estimate:** 435 tests, ~230 hours (6-9 weeks full-time)

This analysis provides a clear roadmap to achieve 100% test coverage systematically.
